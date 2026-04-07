'use server'

import { createClient } from '@/lib/supabase-server'
import type { DayAssignment, StaffWithWish, ShiftSlot, WishType } from '@/types'

// ─── 月全体のシフトデータを取得 ───────────────────────────────
export async function fetchMonthData(year: number, month: number): Promise<{
  assignments: DayAssignment[]
  error?: string
}> {
  const supabase = createClient()

  const pad  = (n: number) => String(n).padStart(2, '0')
  const from = `${year}-${pad(month)}-01`
  const to   = `${year}-${pad(month)}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  // 前月末日（月初の夜勤明けNG判定用）
  const prevMonthEnd = new Date(year, month - 1, 0)
  const prevEndStr   = `${prevMonthEnd.getFullYear()}-${pad(prevMonthEnd.getMonth() + 1)}-${pad(prevMonthEnd.getDate())}`

  const [profilesRes, shiftsRes, wishesRes, prevNightRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('role', 'staff'),
    supabase.from('shifts').select('id, staff_id, shift_date, slot').gte('shift_date', from).lte('shift_date', to),
    supabase.from('shift_wishes').select('staff_id, wish_date, wish').gte('wish_date', from).lte('wish_date', to),
    supabase.from('shifts').select('staff_id').eq('shift_date', prevEndStr).eq('slot', 'night'),
  ])

  if (profilesRes.error) return { assignments: [], error: profilesRes.error.message }

  const profiles  = profilesRes.data  ?? []
  const shifts    = shiftsRes.data    ?? []
  const wishes    = wishesRes.data    ?? []
  const prevNight = prevNightRes.data ?? []

  // 名前マップ
  const nameMap = new Map(profiles.map(p => [p.id, p.full_name]))

  // 希望マップ: wish_date → staffId → wish
  const wishMap = new Map<string, Map<string, WishType>>()
  for (const w of wishes) {
    if (!wishMap.has(w.wish_date)) wishMap.set(w.wish_date, new Map())
    wishMap.get(w.wish_date)!.set(w.staff_id, w.wish as WishType)
  }

  // 日別・夜勤スタッフIDセット（翌日のNG判定用）
  // 前月末の夜勤 → 月初1日の朝勤NG判定
  const nightByDate = new Map<string, Set<string>>()
  nightByDate.set(prevEndStr, new Set(prevNight.map(s => s.staff_id)))
  for (const s of shifts) {
    if (s.slot === 'night') {
      if (!nightByDate.has(s.shift_date)) nightByDate.set(s.shift_date, new Set())
      nightByDate.get(s.shift_date)!.add(s.staff_id)
    }
  }

  // 日別スロット別スタッフ
  const slotsByDate = new Map<string, Record<ShiftSlot, StaffWithWish[]>>()
  for (const s of shifts) {
    if (!slotsByDate.has(s.shift_date)) {
      slotsByDate.set(s.shift_date, { morning: [], evening: [], night: [] })
    }
    const prevDate = new Date(s.shift_date)
    prevDate.setDate(prevDate.getDate() - 1)
    const prevStr = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}-${pad(prevDate.getDate())}`
    const prevNightIds = nightByDate.get(prevStr) ?? new Set<string>()

    slotsByDate.get(s.shift_date)![s.slot as ShiftSlot].push({
      staffId:  s.staff_id,
      fullName: nameMap.get(s.staff_id) ?? '不明',
      wish:     wishMap.get(s.shift_date)?.get(s.staff_id) ?? 'off',
      prevSlot: prevNightIds.has(s.staff_id) ? 'night' : null,
      shiftId:  s.id,
    })
  }

  // 月全日の DayAssignment を生成
  const assignments: DayAssignment[] = []
  for (let d = new Date(year, month - 1, 1); d <= new Date(year, month - 1, new Date(year, month, 0).getDate()); d.setDate(d.getDate() + 1)) {
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const slots   = slotsByDate.get(dateStr)
    assignments.push({
      date:    dateStr,
      morning: slots?.morning ?? [],
      evening: slots?.evening ?? [],
      night:   slots?.night   ?? [],
    })
  }

  return { assignments }
}

// ─── 1日分のデータをSupabaseから取得 ──────────────────────────
export async function fetchDayData(dateStr: string): Promise<{
  pool: StaffWithWish[]
  assignment: DayAssignment
  error?: string
}> {
  const supabase = createClient()
  const emptyAssignment: DayAssignment = { date: dateStr, morning: [], evening: [], night: [] }

  // 前日日付（夜勤明けチェック用）
  const prevDate = new Date(dateStr)
  prevDate.setDate(prevDate.getDate() - 1)
  const prevDateStr = prevDate.toISOString().split('T')[0]

  // ── 並列フェッチ ─────────────────────────────────────────────
  const [profilesRes, wishesRes, shiftsRes, prevShiftsRes] = await Promise.all([
    // スタッフ一覧（staff ロールのみ）
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('role', 'staff'),

    // 当日の希望
    supabase
      .from('shift_wishes')
      .select('staff_id, wish')
      .eq('wish_date', dateStr),

    // 当日の確定シフト
    supabase
      .from('shifts')
      .select('id, staff_id, slot')
      .eq('shift_date', dateStr),

    // 前日の夜勤（夜勤明けチェック）
    supabase
      .from('shifts')
      .select('staff_id')
      .eq('shift_date', prevDateStr)
      .eq('slot', 'night'),
  ])

  if (profilesRes.error) {
    return { pool: [], assignment: emptyAssignment, error: profilesRes.error.message }
  }

  const profiles    = profilesRes.data  ?? []
  const wishes      = wishesRes.data    ?? []
  const shifts      = shiftsRes.data    ?? []
  const prevNight   = prevShiftsRes.data ?? []

  // 前日夜勤スタッフのIDセット
  const prevNightIds = new Set(prevNight.map(s => s.staff_id))

  // wish マップ
  const wishMap = new Map<string, WishType>(
    wishes.map(w => [w.staff_id, w.wish as WishType])
  )

  // シフト済みスタッフのマップ {staffId → slot}
  const shiftMap = new Map<string, { slot: ShiftSlot; shiftId: string }>(
    shifts.map(s => [s.staff_id, { slot: s.slot as ShiftSlot, shiftId: s.id }])
  )

  // StaffWithWish を生成
  const allStaff: StaffWithWish[] = profiles.map(p => ({
    staffId:  p.id,
    fullName: p.full_name,
    wish:     wishMap.get(p.id) ?? 'off',
    prevSlot: prevNightIds.has(p.id) ? 'night' : null,
    shiftId:  shiftMap.get(p.id)?.shiftId ?? null,
  }))

  // シフト済みをスロットへ振り分け、未配置はプールへ
  const assignment: DayAssignment = { date: dateStr, morning: [], evening: [], night: [] }
  const pool: StaffWithWish[] = []

  for (const staff of allStaff) {
    const assigned = shiftMap.get(staff.staffId)
    if (assigned) {
      assignment[assigned.slot].push(staff)
    } else {
      pool.push(staff)
    }
  }

  return { pool, assignment }
}

// ─── シフトを保存（当日分を全削除→再挿入） ───────────────────
export async function saveShifts(assignment: DayAssignment): Promise<{ error?: string }> {
  const supabase = createClient()
  const dateStr  = assignment.date

  // 全スロットのスタッフをフラット化
  const slots: ShiftSlot[] = ['morning', 'evening', 'night']
  const rows = slots.flatMap(slot =>
    assignment[slot].map(staff => ({
      staff_id:     staff.staffId,
      shift_date:   dateStr,
      slot,
      is_confirmed: true,
      ai_suggested: false,
    }))
  )

  // 1. 当日の既存シフトを削除
  const { error: deleteError } = await supabase
    .from('shifts')
    .delete()
    .eq('shift_date', dateStr)

  if (deleteError) return { error: deleteError.message }

  // 2. 新しいシフトを挿入（配置ゼロの日は空INSERT）
  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from('shifts')
      .insert(rows)

    if (insertError) return { error: insertError.message }
  }

  return {}
}
