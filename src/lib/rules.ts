// ============================================================
// シフトの自動チェックロジック
// 警告のみ。保存は止めない。
// ============================================================

/** チェック用のシフト情報 */
export interface ShiftEntry {
  id: string
  staff_id: string
  facility_id: string
  date: string        // 'YYYY-MM-DD'（開始日）
  kind: string        // 'morning' | 'evening' | 'night' | 'base' | 'custom'
  start_time: string  // 'HH:MM:SS'
  end_time: string    // 'HH:MM:SS'（翌日終了のとき end < start）
  starts_at: string   // 'YYYY-MM-DD HH:MM:SS'（DB の生成列）
  ends_at: string     // 'YYYY-MM-DD HH:MM:SS'
}

/** 施設・枠の定義（min_overrides 適用済みの min_staff を渡す） */
export interface SlotDef {
  facility_id: string
  key: string
  start_time: string
  end_time: string
  min_staff: number
}

/** 希望（朝夕の一致判定で使う） */
export interface RequestEntry {
  staff_id: string
  date: string
  type: 'morning' | 'evening' | 'both' | 'night' | 'off' | 'custom'
}

export type ViolationType = 'interval' | 'overlap' | 'understaffed' | 'partial_both'

export interface Violation {
  type: ViolationType
  shiftIds: string[]
  staffId?: string
  facilityId?: string
  date?: string
  slotKey?: string
  message: string
}

const INTERVAL_MINUTES = 8 * 60  // 8時間

/** 'YYYY-MM-DD HH:MM:SS' → 分（epoch からの差分） */
function toMin(ts: string): number {
  return new Date(ts.replace(' ', 'T')).getTime() / 60000
}

// ─── インターバルチェック ─────────────────────────────────────
/**
 * 同一スタッフの連続する勤務で、前の終了から次の開始まで 8 時間未満なら違反。
 * 施設をまたいで判定する。
 */
export function checkInterval(shifts: ShiftEntry[]): Violation[] {
  const byStaff = new Map<string, ShiftEntry[]>()
  for (const s of shifts) {
    const arr = byStaff.get(s.staff_id) ?? []
    arr.push(s)
    byStaff.set(s.staff_id, arr)
  }

  const violations: Violation[] = []

  byStaff.forEach((staffShifts, staffId) => {
    const sorted = [...staffShifts].sort(
      (a, b) => toMin(a.starts_at) - toMin(b.starts_at)
    )
    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i]
      const next = sorted[i + 1]
      const gap = toMin(next.starts_at) - toMin(curr.ends_at)
      if (gap < INTERVAL_MINUTES) {
        const h = Math.floor(gap / 60)
        const m = gap % 60
        violations.push({
          type: 'interval',
          shiftIds: [curr.id, next.id],
          staffId,
          message: `インターバル不足（${h}時間${m > 0 ? m + '分' : ''}）`,
        })
      }
    }
  })

  return violations
}

// ─── 重複チェック ────────────────────────────────────────────
/**
 * 同一スタッフが異なる施設で時間が重なっていれば違反。
 */
export function checkOverlap(shifts: ShiftEntry[]): Violation[] {
  const byStaff = new Map<string, ShiftEntry[]>()
  for (const s of shifts) {
    const arr = byStaff.get(s.staff_id) ?? []
    arr.push(s)
    byStaff.set(s.staff_id, arr)
  }

  const violations: Violation[] = []

  byStaff.forEach((staffShifts, staffId) => {
    for (let i = 0; i < staffShifts.length; i++) {
      for (let j = i + 1; j < staffShifts.length; j++) {
        const a = staffShifts[i]
        const b = staffShifts[j]
        if (a.facility_id !== b.facility_id && _overlaps(a, b)) {
          violations.push({
            type: 'overlap',
            shiftIds: [a.id, b.id],
            staffId,
            message: `${a.facility_id} と ${b.facility_id} で時間が重複`,
          })
        }
      }
    }
  })

  return violations
}

function _overlaps(a: ShiftEntry, b: ShiftEntry): boolean {
  return toMin(a.starts_at) < toMin(b.ends_at) && toMin(b.starts_at) < toMin(a.ends_at)
}

// ─── 欠員チェック ────────────────────────────────────────────
/**
 * 施設・日・枠ごとに配置人数が min_staff を下回れば違反。
 * shifts は対象の日の分だけ渡してもよいが、絞り込みもここで行う。
 */
export function checkUnderstaffed(
  shifts: ShiftEntry[],
  slots: SlotDef[],
  facilityId: string,
  date: string,
): Violation[] {
  const violations: Violation[] = []
  const facilitySlots = slots.filter(s => s.facility_id === facilityId)
  const dayShifts = shifts.filter(
    s => s.facility_id === facilityId && s.date === date
  )

  for (const slot of facilitySlots) {
    const matched = dayShifts.filter(s => s.kind === slot.key)
    if (matched.length < slot.min_staff) {
      violations.push({
        type: 'understaffed',
        shiftIds: matched.map(s => s.id),
        facilityId,
        date,
        slotKey: slot.key,
        message: `${slot.key} 枠：${matched.length}/${slot.min_staff}名（${slot.min_staff - matched.length}名不足）`,
      })
    }
  }

  return violations
}

// ─── 朝夕の一致判定（一部カバー）───────────────────────────────
/**
 * 希望が 'both'（朝夕）のスタッフが、その日に morning・evening 両方に配置されているか。
 * 片方だけなら partial_both 違反。
 */
export function checkBothCoverage(
  requests: RequestEntry[],
  shifts: ShiftEntry[],
): Violation[] {
  const violations: Violation[] = []

  for (const req of requests) {
    if (req.type !== 'both') continue
    const dayShifts = shifts.filter(
      s => s.staff_id === req.staff_id && s.date === req.date
    )
    const hasMorning = dayShifts.some(s => s.kind === 'morning')
    const hasEvening = dayShifts.some(s => s.kind === 'evening')

    if (hasMorning && hasEvening) continue  // OK

    let msg: string
    if (!hasMorning && !hasEvening) msg = '朝夕希望：配置なし'
    else if (hasMorning) msg = '朝夕希望：朝のみ配置（夕が未配置）'
    else msg = '朝夕希望：夕のみ配置（朝が未配置）'

    violations.push({
      type: 'partial_both',
      shiftIds: dayShifts.map(s => s.id),
      staffId: req.staff_id,
      date: req.date,
      message: msg,
    })
  }

  return violations
}

// ─── 一括実行 ─────────────────────────────────────────────────
/**
 * 全チェックをまとめて実行する。
 * facilityDates: 欠員チェック対象の施設・日のペア
 */
export function runAllChecks(params: {
  shifts: ShiftEntry[]
  slots: SlotDef[]
  requests: RequestEntry[]
  facilityDates: { facilityId: string; date: string }[]
}): Violation[] {
  const { shifts, slots, requests, facilityDates } = params
  return [
    ...checkInterval(shifts),
    ...checkOverlap(shifts),
    ...facilityDates.flatMap(({ facilityId, date }) =>
      checkUnderstaffed(shifts, slots, facilityId, date)
    ),
    ...checkBothCoverage(requests, shifts),
  ]
}
