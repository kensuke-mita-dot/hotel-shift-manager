'use server'

// 管理者がシフトを組むためのデータ取得・保存（日次調整・月間・公開）
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth-guard'
import { addDays, monthRange, facilityRank, mainFacility, compareStaffInFacility } from '@/lib/utils'
import { KIND_BOTH, KIND_CUSTOM, LEAVE_KINDS, bothTimes } from '@/lib/shift-kinds'
import type { Facility, FacilitySlot, RequestType } from '@/types'
import { validateDayRequests } from '@/lib/requests'

export interface BoardStaff {
  id: string
  fullName: string
  loginId: string | null
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
  /** 浮きを朝・夕などの人数に数えるときの枠（null なら数えない） */
  covers_slot: string | null
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
    db.from('profiles').select('id, full_name, login_id, role, is_staff, is_active').eq('is_active', true).order('full_name'),
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
      loginId: p.login_id ?? null,
      isAdmin: p.role === 'admin',
      facilityIds: sfMap.get(p.id)?.ids ?? [],
      primaryFacilityId: sfMap.get(p.id)?.primary ?? null,
    }))
    // 主な所属の施設順（BHJ → MAHT → BHKK → MAHNM → MAHB → 未設定）、同じ施設内は管理者→ログインID順
    .sort((a, b) => facilityRank(mainFacility(a)) - facilityRank(mainFacility(b)) || compareStaffInFacility(a, b))

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
  // 権限チェックと読み込みを同時に始める（権限がなければ結果は返さない）
  const db = createAdminClient()
  const [guard, base, shRes, rqRes, moRes] = await Promise.all([
    requireAdmin(),
    loadBase(),
    db.from('shifts')
      .select('id, facility_id, staff_id, date, kind, start_time, end_time, starts_at, ends_at, status, covers_slot')
      .gte('date', addDays(date, -1)).lte('date', addDays(date, 1)),
    db.from('shift_requests').select('staff_id, date, type, start_time, end_time').eq('date', date),
    db.from('min_overrides').select('facility_id, slot_key, min_staff').eq('date', date),
  ])
  if ('error' in guard) return { ...empty, error: guard.error }
  if (base.error) return { ...empty, error: base.error }
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
  /** 浮きのとき：人数に数える枠（'morning' | 'evening' など。null・未指定なら数えない） */
  coversSlot?: string | null
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
    if (input.coversSlot && !fs.some(x => x.key === input.coversSlot)) return { error: '人数に数える枠が見つかりません' }
  } else if (LEAVE_KINDS.includes(input.kind)) {
    // 休み・有給は勤務ではないので時刻なし（00:00-00:00 で保存）
    start = '00:00'; end = '00:00'
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
    // 浮き以外では使わない。未指定なら列に触れない（SQL 010 未適用でも動くように）
    ...(input.kind === KIND_CUSTOM && input.coversSlot ? { covers_slot: input.coversSlot } : {}),
  })
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return { error: 'この人はこの日、この施設に既に入っています（朝と夕の両方なら「朝夕（通し）」を使ってください）' }
    }
    return { error: error.message }
  }

  // 休み・有給は「人×日」で1つ。ほかの施設に入っている休み・有給は外す
  if (LEAVE_KINDS.includes(input.kind)) {
    const { error: delErr } = await supabase.from('shifts').delete()
      .eq('staff_id', input.staffId).eq('date', input.date).in('kind', LEAVE_KINDS)
      .neq('facility_id', input.facilityId)
    if (delErr) return { error: delErr.message }
  }

  revalidatePath('/admin', 'layout')
  return {}
}

/**
 * 月間の表から1マス分のシフトを置き換える（kind = null で外す）。
 * 1人・1日・1施設につきシフトは1つなので、既存を消してから入れる。
 */
export async function setCellShift(input: {
  facilityId: string
  date: string
  staffId: string
  kind: string | null
  start?: string
  end?: string
  coversSlot?: string | null
}): Promise<{ error?: string }> {
  // 権限チェックと既存シフトの確認を同時に行う
  const supabase = createClient()
  const [guard, { data: existing, error: selErr }] = await Promise.all([
    requireAdmin(),
    supabase.from('shifts')
      .select('id, kind, start_time, end_time, covers_slot')
      .eq('facility_id', input.facilityId).eq('staff_id', input.staffId).eq('date', input.date),
  ])
  if ('error' in guard) return { error: guard.error }
  if (selErr) return { error: selErr.message }

  if (input.kind === null) {
    if (existing?.length) {
      const { error } = await supabase.from('shifts').delete().in('id', existing.map(e => e.id))
      if (error) return { error: error.message }
    }
    revalidatePath('/admin', 'layout')
    return {}
  }

  if (existing?.length) {
    const { error } = await supabase.from('shifts').delete().in('id', existing.map(e => e.id))
    if (error) return { error: error.message }
  }
  const r = await addShift({
    facilityId: input.facilityId, date: input.date, staffId: input.staffId,
    kind: input.kind, start: input.start, end: input.end, coversSlot: input.coversSlot,
  })
  if (r.error && existing?.length) {
    // 失敗したら元に戻す
    const e = existing[0]
    await addShift({
      facilityId: input.facilityId, date: input.date, staffId: input.staffId,
      kind: e.kind, start: e.start_time.slice(0, 5), end: e.end_time.slice(0, 5), coversSlot: e.covers_slot,
    })
  }
  return r
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
  /** 勤務間隔・重複チェック用（前月末日〜翌月1日を含む全施設のシフト） */
  checkShifts: BoardShift[]
  /** その月の希望（空いているマスに薄く表示） */
  requests: BoardRequest[]
  publish: PublishInfo[]
}

const sig = (s: { staff_id: string; date: string; kind: string; start_time: string; end_time: string; facility_id: string }) =>
  `${s.facility_id}|${s.staff_id}|${s.date}|${s.kind}|${s.start_time}|${s.end_time}`

export async function fetchMonthBoard(month: string): Promise<MonthBoard> {
  const empty: MonthBoard = { month, facilities: [], slots: [], staff: [], shifts: [], checkShifts: [], requests: [], publish: [] }
  // 権限チェックと読み込みを同時に始める（権限がなければ結果は返さない）
  const { from, to } = monthRange(month)
  const db = createAdminClient()
  const [guard, base, shRes, pbRes, rqRes] = await Promise.all([
    requireAdmin(),
    loadBase(),
    db.from('shifts')
      .select('id, facility_id, staff_id, date, kind, start_time, end_time, starts_at, ends_at, status, covers_slot')
      .gte('date', addDays(from, -1)).lte('date', addDays(to, 1)),
    db.from('published_shifts')
      .select('facility_id, staff_id, date, kind, start_time, end_time, published_at')
      .gte('date', from).lte('date', to),
    db.from('shift_requests').select('staff_id, date, type, start_time, end_time').gte('date', from).lte('date', to),
  ])
  if ('error' in guard) return { ...empty, error: guard.error }
  if (base.error) return { ...empty, error: base.error }
  const err = shRes.error ?? pbRes.error ?? rqRes.error
  if (err) return { ...empty, error: err.message }

  const checkShifts = (shRes.data ?? []) as BoardShift[]
  const shifts = checkShifts.filter(s => s.date >= from && s.date <= to)
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

  return { ...base, month, shifts, checkShifts, requests: (rqRes.data ?? []) as BoardRequest[], publish }
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

// ─── 希望（管理者が一覧・代理入力） ─────────────────────────────
export interface RequestBoard extends BoardBase {
  month: string
  requests: BoardRequest[]
  submissions: { staff_id: string; submitted_at: string | null; extended_until: string | null }[]
}

export async function fetchRequestBoard(month: string): Promise<RequestBoard> {
  const empty: RequestBoard = { month, facilities: [], slots: [], staff: [], requests: [], submissions: [] }
  // 権限チェックと読み込みを同時に始める（権限がなければ結果は返さない）
  const { from, to } = monthRange(month)
  const db = createAdminClient()
  const [guard, base, rqRes, sbRes] = await Promise.all([
    requireAdmin(),
    loadBase(),
    db.from('shift_requests').select('staff_id, date, type, start_time, end_time').gte('date', from).lte('date', to),
    db.from('request_submissions').select('staff_id, submitted_at, extended_until').eq('month', `${month}-01`),
  ])
  if ('error' in guard) return { ...empty, error: guard.error }
  if (base.error) return { ...empty, error: base.error }
  const err = rqRes.error ?? sbRes.error
  if (err) return { ...empty, error: err.message }

  return { ...base, month, requests: (rqRes.data ?? []) as BoardRequest[], submissions: sbRes.data ?? [] }
}

const REQUEST_TYPES: RequestType[] = ['morning', 'evening', 'both', 'night', 'off', 'custom']

/** 管理者がスタッフの1日分の希望をまとめて置き換える（空配列で削除）。提出期限に関係なく書ける */
export async function setDayRequestsAsAdmin(input: {
  staffId: string
  date: string
  items: { type: RequestType; start?: string; end?: string }[]
}): Promise<{ error?: string }> {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: '日付が不正です' }

  const rows = input.items.map(i => ({
    staff_id: input.staffId,
    date: input.date,
    type: i.type,
    start_time: i.type === 'custom' ? i.start ?? null : null,
    end_time:   i.type === 'custom' ? i.end ?? null : null,
  }))
  if (rows.some(r => !REQUEST_TYPES.includes(r.type))) return { error: '希望の種類が不正です' }
  if (rows.some(r => r.type === 'custom' && (!TIME.test(r.start_time ?? '') || !TIME.test(r.end_time ?? '')))) {
    return { error: '時間指定は開始と終了の時刻を入れてください' }
  }
  const msg = validateDayRequests(rows)
  if (msg) return { error: msg }

  const supabase = createClient()
  const { error: delErr } = await supabase.from('shift_requests').delete()
    .eq('staff_id', input.staffId).eq('date', input.date)
  if (delErr) return { error: delErr.message }
  if (rows.length > 0) {
    const { error } = await supabase.from('shift_requests').insert(rows)
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        return { error: '時間指定を2つ入れるには、Supabase で 007_two_time_ranges.sql の実行が必要です' }
      }
      return { error: error.message }
    }
  }
  revalidatePath('/admin', 'layout')
  return {}
}
