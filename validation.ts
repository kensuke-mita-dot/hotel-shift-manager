// src/lib/validation.ts
import type { DayAssignment, ValidationResult, ShiftSlot } from '@/types'

/**
 * 1日分のアサイン状態を検証する
 * 1. 各スロットに最低1名いること
 * 2. 夜勤明けスタッフが朝勤に入っていないこと
 */
export function validateDayAssignment(day: DayAssignment): ValidationResult {
  const slots: ShiftSlot[] = ['morning', 'evening', 'night']

  const hasEmptySlot = slots.some(slot => day[slot].length === 0)

  const ngPatterns = day.morning
    .filter(s => s.prevSlot === 'night')
    .map(s => ({ staffName: s.fullName, slot: 'morning' as ShiftSlot }))

  return {
    hasEmptySlot,
    ngPatterns,
    isValid: !hasEmptySlot && ngPatterns.length === 0,
  }
}

/**
 * 月次マトリックス全体を走査して警告リストを返す
 */
export function validateMonthMatrix(
  days: DayAssignment[]
): { date: string; issues: string[] }[] {
  return days.map(day => {
    const { hasEmptySlot, ngPatterns } = validateDayAssignment(day)
    const issues: string[] = []
    if (hasEmptySlot) issues.push('空きスロットあり')
    ngPatterns.forEach(p => issues.push(`${p.staffName}：夜勤明け朝勤NG`))
    return { date: day.date, issues }
  }).filter(d => d.issues.length > 0)
}
