// src/lib/shift-kinds.ts
// シフトの種類（shifts.kind）の表示と時間計算
//   施設の枠（morning / evening / night / base）に加えて
//   both   = 朝夕通し（朝の開始〜夕の終了の1枠。朝枠・夕枠の両方に数える）
//   custom = 浮き（時間を指定。枠の人数には数えない）
import type { FacilitySlot } from '@/types'

export const KIND_BOTH   = 'both'
export const KIND_CUSTOM = 'custom'

export const KIND_COLOR: Record<string, string> = {
  morning: '#e0a23a',
  evening: '#2b8fe0',
  night:   '#5b4fc4',
  base:    '#2f9e6b',
  both:    '#d0702a',
  custom:  '#80858c',
}

/** 月間表などで使う1文字ラベル */
export const KIND_SHORT: Record<string, string> = {
  morning: '朝', evening: '夕', night: '夜', base: '基', both: '通', custom: '浮',
}

export const hhmm = (t: string) => t.slice(0, 5)

/** 表示用の行（枠 + 朝夕通し + 浮き） */
export interface BoardRow {
  kind: string
  label: string
  start: string | null   // 浮きは null（人ごとに時間を持つ）
  end: string | null
  /** 最低人数（朝夕通し・浮きは null） */
  min: number | null
}

/** 施設の枠から、日次調整に並べる行を作る */
export function boardRows(slots: FacilitySlot[]): BoardRow[] {
  const sorted = [...slots].sort((a, b) => a.sort - b.sort)
  const rows: BoardRow[] = sorted.map(s => ({
    kind: s.key,
    label: s.key === 'base' ? '基本' : `${s.label}勤`,
    start: s.start_time,
    end: s.end_time,
    min: s.min_staff,
  }))
  const both = bothTimes(slots)
  if (both) {
    const eveningIdx = rows.findIndex(r => r.kind === 'evening')
    rows.splice(eveningIdx + 1, 0, { kind: KIND_BOTH, label: '朝夕（通し）', start: both.start, end: both.end, min: null })
  }
  rows.push({ kind: KIND_CUSTOM, label: '浮き', start: null, end: null, min: null })
  return rows
}

/** 朝夕通しの時間（朝の開始〜夕の終了）。朝・夕の枠がない施設は null */
export function bothTimes(slots: FacilitySlot[]): { start: string; end: string } | null {
  const m = slots.find(s => s.key === 'morning')
  const e = slots.find(s => s.key === 'evening')
  return m && e ? { start: m.start_time, end: e.end_time } : null
}

/** シフトの表示名（施設の枠ラベルを使う） */
export function kindLabel(kind: string, slots: FacilitySlot[]): string {
  if (kind === KIND_BOTH) return '朝夕'
  if (kind === KIND_CUSTOM) return '浮き'
  const s = slots.find(x => x.key === kind)
  if (!s) return kind
  return s.key === 'base' ? '基本' : s.label
}

// ─── 労働時間・深夜時間の計算（人件費用） ───────────────────
const toMinOfDay = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/**
 * 実働時間と深夜時間（分）。
 * - 拘束 6h超 → 休憩45分、8h超 → 休憩60分 を差し引く（労基法の下限）
 * - 深夜（22:00〜翌5:00）にかかる時間。休憩は深夜帯以外で取る前提（実働を超えない）
 */
export function workMinutes(start: string, end: string): { paid: number; lateNight: number; span: number } {
  const s = toMinOfDay(start)
  let e = toMinOfDay(end)
  if (e <= s) e += 24 * 60
  const span = e - s
  const brk  = span > 8 * 60 ? 60 : span > 6 * 60 ? 45 : 0
  const paid = span - brk

  // 深夜帯：前日22時〜5時、当日22時〜翌5時
  const windows: [number, number][] = [[-120, 300], [1320, 1740]]
  let late = 0
  for (const [ws, we] of windows) late += Math.max(0, Math.min(e, we) - Math.max(s, ws))

  return { paid, lateNight: Math.min(late, paid), span }
}
