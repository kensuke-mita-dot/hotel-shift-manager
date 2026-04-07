'use server'

import { createClient } from '@/lib/supabase-server'
import type { DayAssignment, StaffWithWish, ShiftSlot, WishType } from '@/types'

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
