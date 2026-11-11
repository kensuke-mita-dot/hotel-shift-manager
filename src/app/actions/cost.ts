'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth-guard'
import { FACILITIES, SLOT_HOURS, LATE_NIGHT_PREMIUM } from '@/types'
import type { ShiftSlot, WishType, TransportType } from '@/types'

export interface StaffCost {
  staffId:         string
  fullName:        string
  facility:        string | null
  hourlyWage:      number
  transportType:   TransportType
  transportAmount: number
  days:            number
  hours:           number
  lateNightHours:  number
  pay:             number
  transport:       number
  total:           number
  /** 出勤を希望した日数（朝・夕・夜希望） */
  wishedDays:      number
  /** 希望どおりのスロットに入った日数 */
  matchedDays:     number
  /** 休希望の日に出勤した日数 */
  offWorkDays:     number
}

export interface FacilityCost {
  code:      string
  name:      string
  staffN:    number
  days:      number
  hours:     number
  pay:       number
  transport: number
  total:     number
  wishedDays:  number
  matchedDays: number
}

export interface CostData {
  year:        number
  month:       number
  staff:       StaffCost[]
  facilities:  FacilityCost[]
  total:       { pay: number; transport: number; total: number; hours: number; days: number }
  missingWage: string[]
  error?:      string
}

const UNASSIGNED = '__none__'

export async function fetchCostData(year: number, month: number): Promise<CostData> {
  const empty: CostData = {
    year, month, staff: [], facilities: [],
    total: { pay: 0, transport: 0, total: 0, hours: 0, days: 0 },
    missingWage: [],
  }

  const guard = await requireAdmin()
  if ('error' in guard) return { ...empty, error: guard.error }

  const pad  = (n: number) => String(n).padStart(2, '0')
  const from = `${year}-${pad(month)}-01`
  const to   = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`

  const db = createAdminClient()
  const [profilesRes, shiftsRes, wishesRes] = await Promise.all([
    db.from('profiles')
      .select('id, full_name, facility, hourly_wage, transport_type, transport_amount')
      .eq('role', 'staff')
      .order('full_name'),
    db.from('shifts').select('staff_id, shift_date, slot').gte('shift_date', from).lte('shift_date', to),
    db.from('shift_wishes').select('staff_id, wish_date, wish').gte('wish_date', from).lte('wish_date', to),
  ])

  if (profilesRes.error) {
    const hint = profilesRes.error.message.includes('column')
      ? '（Supabase に 003_staff_pay_settings.sql が未適用の可能性があります）'
      : ''
    return { ...empty, error: profilesRes.error.message + hint }
  }
  if (shiftsRes.error) return { ...empty, error: shiftsRes.error.message }
  if (wishesRes.error) return { ...empty, error: wishesRes.error.message }

  // staffId → date → wish
  const wishMap = new Map<string, Map<string, WishType>>()
  for (const w of wishesRes.data ?? []) {
    if (!wishMap.has(w.staff_id)) wishMap.set(w.staff_id, new Map())
    wishMap.get(w.staff_id)!.set(w.wish_date, w.wish as WishType)
  }

  // staffId → shifts
  const shiftMap = new Map<string, { date: string; slot: ShiftSlot }[]>()
  for (const s of shiftsRes.data ?? []) {
    if (!shiftMap.has(s.staff_id)) shiftMap.set(s.staff_id, [])
    shiftMap.get(s.staff_id)!.push({ date: s.shift_date, slot: s.slot as ShiftSlot })
  }

  const staff: StaffCost[] = (profilesRes.data ?? []).map(p => {
    const wage    = p.hourly_wage ?? 0
    const tType   = (p.transport_type ?? 'per_day') as TransportType
    const tAmount = p.transport_amount ?? 0
    const shifts  = shiftMap.get(p.id) ?? []
    const wishes  = wishMap.get(p.id) ?? new Map<string, WishType>()

    let hours = 0, late = 0, matched = 0, offWork = 0
    const workDates = new Set<string>()
    for (const s of shifts) {
      hours += SLOT_HOURS[s.slot].paid
      late  += SLOT_HOURS[s.slot].lateNight
      workDates.add(s.date)
      const w = wishes.get(s.date)
      if (w === s.slot) matched++
      if (w === 'off')  offWork++
    }
    const days = workDates.size
    const wishedDays = Array.from(wishes.values()).filter(w => w !== 'off').length

    const pay       = wage * hours + wage * LATE_NIGHT_PREMIUM * late
    const transport = tType === 'per_day' ? tAmount * days : (days > 0 ? tAmount : 0)

    return {
      staffId: p.id, fullName: p.full_name, facility: p.facility ?? null,
      hourlyWage: wage, transportType: tType, transportAmount: tAmount,
      days, hours, lateNightHours: late,
      pay: Math.round(pay), transport, total: Math.round(pay) + transport,
      wishedDays, matchedDays: matched, offWorkDays: offWork,
    }
  })

  // 施設別に集計（定義済み施設 → その他の施設 → 未設定の順）
  const known = new Map<string, string>(FACILITIES.map(f => [f.code, f.name]))
  const groups = new Map<string, StaffCost[]>()
  for (const s of staff) {
    const key = s.facility || UNASSIGNED
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }
  const order = [
    ...FACILITIES.map(f => f.code as string),
    ...Array.from(groups.keys()).filter(k => k !== UNASSIGNED && !known.has(k)).sort(),
    UNASSIGNED,
  ]
  const facilities: FacilityCost[] = order
    .filter(code => groups.has(code))
    .map(code => {
      const g = groups.get(code)!
      const sum = (f: (s: StaffCost) => number) => g.reduce((a, s) => a + f(s), 0)
      return {
        code: code === UNASSIGNED ? '未設定' : code,
        name: code === UNASSIGNED ? '施設未設定' : known.get(code) ?? code,
        staffN: g.length,
        days: sum(s => s.days), hours: sum(s => s.hours),
        pay: sum(s => s.pay), transport: sum(s => s.transport), total: sum(s => s.total),
        wishedDays: sum(s => s.wishedDays), matchedDays: sum(s => s.matchedDays),
      }
    })

  const total = {
    pay:       staff.reduce((a, s) => a + s.pay, 0),
    transport: staff.reduce((a, s) => a + s.transport, 0),
    total:     staff.reduce((a, s) => a + s.total, 0),
    hours:     staff.reduce((a, s) => a + s.hours, 0),
    days:      staff.reduce((a, s) => a + s.days, 0),
  }

  const missingWage = staff.filter(s => s.hourlyWage === 0 && s.days > 0).map(s => s.fullName)

  return { year, month, staff, facilities, total, missingWage }
}
