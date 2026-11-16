'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth-guard'
import { monthRange } from '@/lib/utils'
import { workMinutes } from '@/lib/shift-kinds'
import { wageAt, PAID_LEAVE_HOURS } from '@/lib/pay'

/** 深夜割増率（労基法の下限 25%） */
const LATE_NIGHT_PREMIUM = 0.25

export interface CostRow {
  staffId: string
  fullName: string
  /** 個別に設定された時給（0 なら施設の初期値で計算） */
  hourlyWage: number
  usesDefaultWage: boolean
  transportType: 'per_shift' | 'monthly'
  transportAmount: number
  /** 施設ごとの内訳 */
  byFacility: Record<string, { shifts: number; minutes: number; pay: number; transport: number }>
  days: number
  /** 有給の日数と賃金（所定時間×時給。給与 pay に含む） */
  paidLeaveDays: number
  paidLeavePay: number
  minutes: number
  lateMinutes: number
  pay: number
  transport: number
  total: number
}

export interface CostData {
  month: string
  facilities: { id: string; name: string }[]
  rows: CostRow[]
  facilityTotals: Record<string, { staff: number; shifts: number; minutes: number; pay: number; transport: number; total: number }>
  total: { pay: number; transport: number; total: number; minutes: number; shifts: number }
  missingWage: string[]
  error?: string
}

export async function fetchCost(month: string): Promise<CostData> {
  const empty: CostData = {
    month, facilities: [], rows: [], facilityTotals: {},
    total: { pay: 0, transport: 0, total: 0, minutes: 0, shifts: 0 }, missingWage: [],
  }
  const guard = await requireAdmin()
  if ('error' in guard) return { ...empty, error: guard.error }

  const { from, to } = monthRange(month)
  const db = createAdminClient()
  const [fRes, shRes, pRes, payRes] = await Promise.all([
    db.from('facilities').select('id, name, sort').order('sort'),
    db.from('shifts').select('facility_id, staff_id, date, kind, start_time, end_time').gte('date', from).lte('date', to),
    db.from('profiles').select('id, full_name'),
    db.from('staff_pay').select('staff_id, hourly_wage, transport_type, transport_amount'),
  ])
  const err = fRes.error ?? shRes.error ?? pRes.error ?? payRes.error
  if (err) return { ...empty, error: err.message }

  const names = new Map((pRes.data ?? []).map(p => [p.id, p.full_name as string]))
  const pays  = new Map((payRes.data ?? []).map(p => [p.staff_id, p]))
  const facilities = (fRes.data ?? []).map(f => ({ id: f.id as string, name: f.name as string }))

  const rowMap = new Map<string, CostRow & { _dates: Map<string, string>; _leave: Set<string> }>()
  const rowFor = (staffId: string) => {
    let r = rowMap.get(staffId)
    if (!r) {
      const p = pays.get(staffId)
      r = {
        staffId,
        fullName: names.get(staffId) ?? '（削除済み）',
        hourlyWage: p?.hourly_wage ?? 0,
        usesDefaultWage: !(p?.hourly_wage && p.hourly_wage > 0),
        transportType: (p?.transport_type ?? 'per_shift') as CostRow['transportType'],
        transportAmount: p?.transport_amount ?? 0,
        byFacility: {}, days: 0, paidLeaveDays: 0, paidLeavePay: 0,
        minutes: 0, lateMinutes: 0, pay: 0, transport: 0, total: 0,
        _dates: new Map(), _leave: new Set(),
      }
      rowMap.set(staffId, r)
    }
    return r
  }

  for (const s of shRes.data ?? []) {
    // 休み：給与なし
    if (s.kind === 'off') continue
    const r = rowFor(s.staff_id)
    const wage = wageAt(r.hourlyWage, s.facility_id)
    const bf = r.byFacility[s.facility_id] ?? { shifts: 0, minutes: 0, pay: 0, transport: 0 }
    r.byFacility[s.facility_id] = bf

    // 有給：所定時間×時給（同じ日に複数あっても1日分）。交通費なし
    if (s.kind === 'paid_leave') {
      if (r._leave.has(s.date)) continue
      r._leave.add(s.date)
      const pay = wage * PAID_LEAVE_HOURS
      bf.pay += pay; r.pay += pay; r.paidLeavePay += pay
      continue
    }

    const w   = workMinutes(s.start_time, s.end_time)
    const pay = wage * (w.paid / 60) + wage * LATE_NIGHT_PREMIUM * (w.lateNight / 60)
    bf.shifts++; bf.minutes += w.paid; bf.pay += pay
    r.minutes += w.paid; r.lateMinutes += w.lateNight; r.pay += pay
    // 交通費（1出勤あたり）は1日1回。同じ日に2施設なら最初の施設に計上
    if (!r._dates.has(s.date)) r._dates.set(s.date, s.facility_id)
  }

  const rows: CostRow[] = []
  rowMap.forEach(r => {
    r.days = r._dates.size
    r.paidLeaveDays = r._leave.size
    r.paidLeavePay = Math.round(r.paidLeavePay)
    if (r.transportType === 'per_shift') {
      r._dates.forEach(fid => { r.byFacility[fid].transport += r.transportAmount })
      r.transport = r.transportAmount * r.days
    } else if (r.days > 0) {
      // 月額は勤務の多い施設に計上
      const main = Object.entries(r.byFacility).sort((a, b) => b[1].shifts - a[1].shifts)[0][0]
      r.byFacility[main].transport += r.transportAmount
      r.transport = r.transportAmount
    }
    r.pay = Math.round(r.pay)
    Object.values(r.byFacility).forEach(b => { b.pay = Math.round(b.pay) })
    r.total = r.pay + r.transport
    const { _dates, _leave, ...rest } = r
    void _dates; void _leave
    rows.push(rest)
  })
  rows.sort((a, b) => b.total - a.total)

  const facilityTotals: CostData['facilityTotals'] = {}
  for (const f of facilities) {
    const t = { staff: 0, shifts: 0, minutes: 0, pay: 0, transport: 0, total: 0 }
    for (const r of rows) {
      const b = r.byFacility[f.id]
      if (!b) continue
      t.staff++; t.shifts += b.shifts; t.minutes += b.minutes; t.pay += b.pay; t.transport += b.transport
    }
    t.total = t.pay + t.transport
    facilityTotals[f.id] = t
  }

  const total = {
    pay: rows.reduce((a, r) => a + r.pay, 0),
    transport: rows.reduce((a, r) => a + r.transport, 0),
    total: rows.reduce((a, r) => a + r.total, 0),
    minutes: rows.reduce((a, r) => a + r.minutes, 0),
    shifts: (shRes.data ?? []).filter(x => x.kind !== 'off' && x.kind !== 'paid_leave').length,
  }

  return {
    month, facilities, rows, facilityTotals, total,
    missingWage: rows.filter(r => r.usesDefaultWage).map(r => r.fullName),
  }
}
