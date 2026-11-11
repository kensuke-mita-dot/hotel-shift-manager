'use server'

// 管理者がシフトを組むためのデータ取得・保存（日次調整・月間・公開）
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth-guard'
import { addDays, monthRange } from '@/lib/utils'
import { KIND_BOTH, KIND_CUSTOM, bothTimes } from '@/lib/shift-kinds'
import type { Facility, FacilitySlot, RequestType } from '@/types'

export interface BoardStaff {
  id: string
  fullName: string
  isAdmin: boolean
  facilityIds: string[]
  primaryFacilityId: string | null
}

export interface BoardShift {
  id: string
  facility_id: string
  staff_id: string
  date: string
  kind: string
  start_time: string
  end_time: string
  starts_at: string
  ends_at: string
  status: 'draft' | 'confirmed'
}

export interface BoardRequest {
  staff_id: string
  date: string
  type: RequestType
  start_time: string | null
  end_time: string | null
}

export interface BoardBase {
  facilities: Facility[]
  slots: FacilitySlot[]
  staff: BoardStaff[]
  error?: string
}

/** 施設・枠・シフト対象者（スタッフ＋シフトに入る管理者） */
async function loadBase(): Promise<BoardBase> {
  const db = createAdminClient()
  const [fRes, sRes, pRes, sfRes] = await Promise.all([
    db.from('facilities').select('id, name, sort').order('sort'),
    db.from('facility_slots').select('*').order('sort'),
    db.from('profiles').select('id, full_name, role, is_staff, is_active').eq('is_active', true).order('full_name'),
    db.from('staff_facilities').select('staff_id, facility_id, is_primary'),
  ])
  const err = fRes.error ?? sRes.error ?? pRes.error ?? sfRes.error
  if (err) return { facilities: [], slots: [], staff: [], error: err.message }

  const sfMap = new Map<string, { ids: string[]; primary: string | null }>()
  for (const r of sfRes.data ?? []) {
    const cur = sfMap.get(r.staff_id) ?? { ids: [], primary: null }
    cur.ids.push(r.facility_id)
    if (r.is_primary) cur.primary = r.facility_id
    sfMap.set(r.staff_id, cur)
  }

  const staff: BoardStaff[] = (pRes.data ?? [])
    .filter(p => p.role === 'staff' || p.is_staff)
    .map(p => ({
      id: p.id,
      fullName: p.full_name,
      isAdmin: p.role === 'admin',
      facilityIds: sfMap.get(p.id)?.ids ?? [],
      primaryFacilityId: sfMap.get(p.id)?.primary ?? null,
    }))

  return { facilities: (fRes.data ?? []) as Facility[], slots: (sRes.data ?? []) as FacilitySlot[], staff }
}

// ─── 日次 ─────────────────────────────────────────────────────
export interface DayBoard extends BoardBase {
  date: string
  /** 前日〜翌日の全施設のシフト（勤務間隔・重複チェック用） */
  shifts: BoardShift[]
  requests: BoardRequest[]
}

export async function fetchDayBoard(date: string): Promise<DayBoard> {
  const empty: DayBoard = { date, facilities: [], slots: [], staff: [], shifts: [], requests: [] }
  const guard = await requireAdmin()
  if ('error' in guard) return { ...empty, error: guard.error }

  const base = await loadBase()
  if (base.error) return { ...empty, error: base.error }

  const db = createAdminClient()
  const [shRes, rqRes, moRes] = await Promise.all([
    db.from('shifts')
      .select('id, facility_id, staff_id, date, kind, start_time, end_time, starts_at, ends_at, status')
      .gte('date', addDays(date, -1)).lte('date', addDays(date, 1)),
    db.from('shift_requests').select('staff_id, date, type, start_time, end_time').eq('date', date),
    db.from('min_overrides').select('facility_id, slot_key, min_staff').eq('date', date),
  ])
  const err = shRes.error ?? rqRes.error ?? moRes.error
  if (err) return { ...empty, error: err.message }

  // その日だけの最低人数の上書きを反映
  const slots = base.slots.map(s => {
    const o = (moRes.data ?? []).find(m => m.facility_id === s.facility_id && m.slot_key === s.key)
    return o ? { ...s, min_staff: o.min_staff } : s
  })

  return {
    ...base, slots, date,
    shifts: (shRes.data ?? []) as BoardShift[],
    requests: (rqRes.data ?? []) as BoardRequest[],
  }
}

// ─── シフトの追加・削除 ───────────────────────────────────────
const TIME = /^\d{2}:\d{2}(:\d{2})?$/

export async function addShift(input: {
  facilityId: string
  date: string
  staffId: string
  kind: string
  start?: string
  end?: string
}): Promise<{ error?: string }> {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: '日付が不正です' }

  const db = createAdminClient()
  const { data: slots } = await db.from('facility_slots').select('*').eq('facility_id', input.facilityId)
  const fs = (slots ?? []) as FacilitySlot[]

  let start: string, end: string
  if (input.kind === KIND_CUSTOM) {
    if (!input.start || !input.end || !TIME.test(input.start) || !TIME.test(input.end)) {
      return { error: '浮きは開始・終了の時刻を入れてください' }
    }
    if (input.start === input.end) return { error: '開始と終了が同じ時刻です' }
    start = input.start; end = input.end
  } else if (input.kind === KIND_BOTH) {
    const t = bothTimes(fs)
    if (!t) return { error: 'この施設には朝夕通しの枠がありません' }
    start = t.start; end = t.end
  } else {
    const s = fs.find(x => x.key === input.kind)
    if (!s) return { error: '枠が見つかりません' }
    start = s.start_time; end = s.end_time
  }

  // 書き込みは本人のセッションで行う（RLS で管理者のみ許可・変更履歴に操作者が残る）
  const supabase = createClient()
  const { error } = await supabase.from('shifts').insert({
    facility_id: input.facilityId,
    staff_id: input.staffId,
    date: input.date,
    kind: input.kind,
    start_time: start,
    end_time: end,
    source: 'admin',
    status: 'draft',
    updated_by: guard.userId,
  })
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return { error: 'この人はこの日、この施設に既に入っています（朝と夕の両方なら「朝夕（通し）」を使ってください）' }
    }
    return { error: error.message }
  }
  revalidatePath('/admin', 'layout')
  return {}
}

export async function removeShift(shiftId: string): Promise<{ error?: string }> {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }

  const supabase = createClient()
  const { error } = await supabase.from('shifts').delete().eq('id', shiftId)
  if (error) return { error: error.message }
  revalidatePath('/admin', 'layout')
  return {}
}

// ─── 月間 ─────────────────────────────────────────────────────
export interface PublishInfo {
  facilityId: string
  publishedAt: string | null
  /** 下書きと公開版の差分件数（0 なら公開済みのまま） */
  pendingChanges: number
}

export interface MonthBoard extends BoardBase {
  month: string   // 'YYYY-MM'
  shifts: BoardShift[]
  publish: PublishInfo[]
}

const sig = (s: { staff_id: string; date: string; kind: string; start_time: string; end_time: string; facility_id: string }) =>
  `${s.facility_id}|${s.staff_id}|${s.date}|${s.kind}|${s.start_time}|${s.end_time}`

export async function fetchMonthBoard(month: string): Promise<MonthBoard> {
  const empty: MonthBoard = { month, facilities: [], slots: [], staff: [], shifts: [], publish: [] }
  const guard = await requireAdmin()
  if ('error' in guard) return { ...empty, error: guard.error }

  const base = await loadBase()
  if (base.error) return { ...empty, error: base.error }

  const { from, to } = monthRange(month)
  const db = createAdminClient()
  const [shRes, pbRes] = await Promise.all([
    db.from('shifts')
      .select('id, facility_id, staff_id, date, kind, start_time, end_time, starts_at, ends_at, status')
      .gte('date', from).lte('date', to),
    db.from('published_shifts')
      .select('facility_id, staff_id, date, kind, start_time, end_time, published_at')
      .gte('date', from).lte('date', to),
  ])
  const err = shRes.error ?? pbRes.error
  if (err) return { ...empty, error: err.message }

  const shifts = (shRes.data ?? []) as BoardShift[]
  const pubs = pbRes.data ?? []

  const publish: PublishInfo[] = base.facilities.map(f => {
    const draft = new Set(shifts.filter(s => s.facility_id === f.id).map(sig))
    const pub   = pubs.filter(p => p.facility_id === f.id)
    const pubSet = new Set(pub.map(sig))
    let diff = 0
    draft.forEach(k => { if (!pubSet.has(k)) diff++ })
    pubSet.forEach(k => { if (!draft.has(k)) diff++ })
    const last = pub.reduce<string | null>((a, p) => (!a || p.published_at > a ? p.published_at : a), null)
    return { facilityId: f.id, publishedAt: last, pendingChanges: diff }
  })

  return { ...base, month, shifts, publish }
}

// ─── 公開 ─────────────────────────────────────────────────────
export async function publishMonth(
  facilityIds: string[],
  month: string,
): Promise<{ changedStaff?: number; error?: string }> {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }

  const supabase = createClient()
  const changed = new Set<string>()
  for (const fid of facilityIds) {
    const { data, error } = await supabase.rpc('publish_shifts', { p_facility: fid, p_month: `${month}-01` })
    if (error) return { error: `${fid}: ${error.message}` }
    for (const r of (data ?? []) as { staff_id: string }[]) changed.add(r.staff_id)
  }
  revalidatePath('/admin', 'layout')
  revalidatePath('/staff/schedule')
  return { changedStaff: changed.size }
}
