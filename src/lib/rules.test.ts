import { describe, it, expect } from 'vitest'
import {
  checkInterval,
  checkOverlap,
  checkUnderstaffed,
  checkBothCoverage,
  runAllChecks,
  type ShiftEntry,
  type SlotDef,
  type RequestEntry,
} from './rules'

// ─── テスト用ヘルパー ─────────────────────────────────────────

let _id = 0
function makeShift(
  staffId: string,
  facilityId: string,
  date: string,
  startTime: string,  // 'HH:MM'
  endTime: string,    // 'HH:MM'（翌日終了のとき end < start）
  kind = 'morning',
): ShiftEntry {
  const id = `s${++_id}`
  // 翌日終了判定
  const endsNextDay = endTime <= startTime
  const endDate = endsNextDay ? nextDate(date) : date
  return {
    id,
    staff_id: staffId,
    facility_id: facilityId,
    date,
    kind,
    start_time: startTime + ':00',
    end_time: endTime + ':00',
    starts_at: `${date} ${startTime}:00`,
    ends_at: `${endDate} ${endTime}:00`,
  }
}

function nextDate(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  dt.setDate(dt.getDate() + 1)
  return dt.toISOString().split('T')[0]
}

function makeSlot(facilityId: string, key: string, minStaff: number): SlotDef {
  return { facility_id: facilityId, key, start_time: '08:00:00', end_time: '16:00:00', min_staff: minStaff }
}

// ─── checkInterval ────────────────────────────────────────────

describe('checkInterval', () => {
  it('ちょうど8時間のインターバルは OK', () => {
    const shifts = [
      makeShift('A', 'BHJ', '2026-12-01', '08:00', '16:00', 'morning'),
      makeShift('A', 'BHJ', '2026-12-01', '24:00', '08:00', 'night'),
    ]
    // ends 16:00, starts 24:00 (next occurrence) → gap = 8h → OK
    // ※ここでは文字列で直接 shifts_at を書く
    const s1 = { ...shifts[0], ends_at: '2026-12-01 16:00:00' }
    const s2 = { ...shifts[1], starts_at: '2026-12-02 00:00:00', ends_at: '2026-12-02 08:00:00' }
    const v = checkInterval([s1, s2])
    expect(v).toHaveLength(0)
  })

  it('7時間59分のインターバルは違反', () => {
    const s1: ShiftEntry = {
      id: 'x1', staff_id: 'A', facility_id: 'BHJ', date: '2026-12-01',
      kind: 'morning', start_time: '08:00:00', end_time: '16:00:00',
      starts_at: '2026-12-01 08:00:00', ends_at: '2026-12-01 16:00:00',
    }
    const s2: ShiftEntry = {
      id: 'x2', staff_id: 'A', facility_id: 'BHJ', date: '2026-12-01',
      kind: 'evening', start_time: '23:59:00', end_time: '07:59:00',
      starts_at: '2026-12-01 23:59:00', ends_at: '2026-12-02 07:59:00',
    }
    const v = checkInterval([s1, s2])
    expect(v).toHaveLength(1)
    expect(v[0].type).toBe('interval')
    expect(v[0].shiftIds).toContain('x1')
    expect(v[0].shiftIds).toContain('x2')
  })

  it('施設をまたいで判定する', () => {
    // BHJ 22:00→08:00（翌日）、MAHB 10:00→19:00 → gap = 2h → 違反
    const s1: ShiftEntry = {
      id: 'n1', staff_id: 'A', facility_id: 'BHJ', date: '2026-12-01',
      kind: 'night', start_time: '22:00:00', end_time: '08:00:00',
      starts_at: '2026-12-01 22:00:00', ends_at: '2026-12-02 08:00:00',
    }
    const s2: ShiftEntry = {
      id: 'm1', staff_id: 'A', facility_id: 'MAHB', date: '2026-12-02',
      kind: 'morning', start_time: '10:00:00', end_time: '19:00:00',
      starts_at: '2026-12-02 10:00:00', ends_at: '2026-12-02 19:00:00',
    }
    const v = checkInterval([s1, s2])
    expect(v).toHaveLength(1)
    expect(v[0].type).toBe('interval')
  })

  it('別スタッフの間は違反にならない', () => {
    const s1: ShiftEntry = {
      id: 'a1', staff_id: 'A', facility_id: 'BHJ', date: '2026-12-01',
      kind: 'morning', start_time: '08:00:00', end_time: '16:00:00',
      starts_at: '2026-12-01 08:00:00', ends_at: '2026-12-01 16:00:00',
    }
    const s2: ShiftEntry = {
      id: 'b1', staff_id: 'B', facility_id: 'BHJ', date: '2026-12-01',
      kind: 'evening', start_time: '17:00:00', end_time: '01:00:00',
      starts_at: '2026-12-01 17:00:00', ends_at: '2026-12-02 01:00:00',
    }
    const v = checkInterval([s1, s2])
    expect(v).toHaveLength(0)
  })

  it('シフトが1件だけのスタッフは違反なし', () => {
    const s = makeShift('A', 'BHJ', '2026-12-01', '08:00', '16:00')
    expect(checkInterval([s])).toHaveLength(0)
  })
})

// ─── checkOverlap ────────────────────────────────────────────

describe('checkOverlap', () => {
  it('異なる施設で時間が重なれば違反', () => {
    const s1: ShiftEntry = {
      id: 'o1', staff_id: 'A', facility_id: 'BHJ', date: '2026-12-01',
      kind: 'morning', start_time: '08:00:00', end_time: '16:00:00',
      starts_at: '2026-12-01 08:00:00', ends_at: '2026-12-01 16:00:00',
    }
    const s2: ShiftEntry = {
      id: 'o2', staff_id: 'A', facility_id: 'MAHB', date: '2026-12-01',
      kind: 'morning', start_time: '10:00:00', end_time: '19:00:00',
      starts_at: '2026-12-01 10:00:00', ends_at: '2026-12-01 19:00:00',
    }
    const v = checkOverlap([s1, s2])
    expect(v).toHaveLength(1)
    expect(v[0].type).toBe('overlap')
  })

  it('同じ施設の重複は overlap 違反にならない', () => {
    // 同施設・同スタッフは DB の unique 制約で防止するが rules 上はスルー
    const s1: ShiftEntry = {
      id: 'p1', staff_id: 'A', facility_id: 'BHJ', date: '2026-12-01',
      kind: 'morning', start_time: '08:00:00', end_time: '16:00:00',
      starts_at: '2026-12-01 08:00:00', ends_at: '2026-12-01 16:00:00',
    }
    const s2: ShiftEntry = {
      id: 'p2', staff_id: 'A', facility_id: 'BHJ', date: '2026-12-01',
      kind: 'evening', start_time: '14:00:00', end_time: '22:00:00',
      starts_at: '2026-12-01 14:00:00', ends_at: '2026-12-01 22:00:00',
    }
    const v = checkOverlap([s1, s2])
    expect(v).toHaveLength(0)
  })

  it('異なる施設でも時間が連続なら（端点のみ接触）違反なし', () => {
    // A が BHJ 08:00-16:00 → MAHB 16:00-22:00 は重複なし
    const s1: ShiftEntry = {
      id: 'q1', staff_id: 'A', facility_id: 'BHJ', date: '2026-12-01',
      kind: 'morning', start_time: '08:00:00', end_time: '16:00:00',
      starts_at: '2026-12-01 08:00:00', ends_at: '2026-12-01 16:00:00',
    }
    const s2: ShiftEntry = {
      id: 'q2', staff_id: 'A', facility_id: 'MAHB', date: '2026-12-01',
      kind: 'evening', start_time: '16:00:00', end_time: '22:00:00',
      starts_at: '2026-12-01 16:00:00', ends_at: '2026-12-01 22:00:00',
    }
    const v = checkOverlap([s1, s2])
    expect(v).toHaveLength(0)
  })

  it('別スタッフは違反にならない', () => {
    const s1: ShiftEntry = {
      id: 'r1', staff_id: 'A', facility_id: 'BHJ', date: '2026-12-01',
      kind: 'morning', start_time: '08:00:00', end_time: '16:00:00',
      starts_at: '2026-12-01 08:00:00', ends_at: '2026-12-01 16:00:00',
    }
    const s2: ShiftEntry = {
      id: 'r2', staff_id: 'B', facility_id: 'MAHB', date: '2026-12-01',
      kind: 'morning', start_time: '10:00:00', end_time: '19:00:00',
      starts_at: '2026-12-01 10:00:00', ends_at: '2026-12-01 19:00:00',
    }
    const v = checkOverlap([s1, s2])
    expect(v).toHaveLength(0)
  })
})

// ─── checkUnderstaffed ──────────────────────────────────────

describe('checkUnderstaffed', () => {
  const slots: SlotDef[] = [
    makeSlot('BHJ', 'morning', 1),
    makeSlot('BHJ', 'evening', 1),
  ]

  it('最低人数を満たしていれば OK', () => {
    const shifts = [
      makeShift('A', 'BHJ', '2026-12-01', '08:00', '16:00', 'morning'),
      makeShift('B', 'BHJ', '2026-12-01', '14:00', '22:00', 'evening'),
    ]
    const v = checkUnderstaffed(shifts, slots, 'BHJ', '2026-12-01')
    expect(v).toHaveLength(0)
  })

  it('配置がゼロなら欠員', () => {
    const v = checkUnderstaffed([], slots, 'BHJ', '2026-12-01')
    expect(v).toHaveLength(2)  // morning も evening も欠員
    expect(v.every(x => x.type === 'understaffed')).toBe(true)
  })

  it('min_staff=2 で 1 人は欠員', () => {
    const slotsMin2: SlotDef[] = [makeSlot('BHJ', 'morning', 2)]
    const shifts = [makeShift('A', 'BHJ', '2026-12-01', '08:00', '16:00', 'morning')]
    const v = checkUnderstaffed(shifts, slotsMin2, 'BHJ', '2026-12-01')
    expect(v).toHaveLength(1)
    expect(v[0].slotKey).toBe('morning')
    expect(v[0].message).toContain('1/2')
  })

  it('他施設のシフトは関係ない', () => {
    const shifts = [makeShift('A', 'MAHB', '2026-12-01', '08:00', '16:00', 'morning')]
    const v = checkUnderstaffed(shifts, slots, 'BHJ', '2026-12-01')
    expect(v).toHaveLength(2)  // BHJ は空
  })
})

// ─── checkBothCoverage ──────────────────────────────────────

describe('checkBothCoverage', () => {
  const req: RequestEntry = { staff_id: 'A', date: '2026-12-01', type: 'both' }

  it('朝・夕どちらも配置されていれば OK', () => {
    const shifts = [
      makeShift('A', 'BHJ', '2026-12-01', '08:00', '16:00', 'morning'),
      makeShift('A', 'BHJ', '2026-12-01', '14:00', '22:00', 'evening'),
    ]
    const v = checkBothCoverage([req], shifts)
    expect(v).toHaveLength(0)
  })

  it('朝のみなら partial_both 違反', () => {
    const shifts = [makeShift('A', 'BHJ', '2026-12-01', '08:00', '16:00', 'morning')]
    const v = checkBothCoverage([req], shifts)
    expect(v).toHaveLength(1)
    expect(v[0].type).toBe('partial_both')
    expect(v[0].message).toContain('夕が未配置')
  })

  it('夕のみなら partial_both 違反', () => {
    const shifts = [makeShift('A', 'BHJ', '2026-12-01', '14:00', '22:00', 'evening')]
    const v = checkBothCoverage([req], shifts)
    expect(v).toHaveLength(1)
    expect(v[0].message).toContain('朝が未配置')
  })

  it('配置なしなら partial_both 違反', () => {
    const v = checkBothCoverage([req], [])
    expect(v).toHaveLength(1)
    expect(v[0].message).toContain('配置なし')
  })

  it("type が 'both' 以外は判定しない", () => {
    const requests: RequestEntry[] = [
      { staff_id: 'A', date: '2026-12-01', type: 'morning' },
      { staff_id: 'B', date: '2026-12-01', type: 'off' },
    ]
    const v = checkBothCoverage(requests, [])
    expect(v).toHaveLength(0)
  })
})

// ─── runAllChecks ────────────────────────────────────────────

describe('runAllChecks', () => {
  it('複数の違反をまとめて返す', () => {
    // スタッフ A: BHJ 22:00-08:00 → MAHT 10:00-18:00（インターバル 2h）
    // スタッフ B: BHJ に配置なし（morning 欠員）
    const shifts: ShiftEntry[] = [
      {
        id: 'r1', staff_id: 'A', facility_id: 'BHJ', date: '2026-12-01',
        kind: 'night', start_time: '22:00:00', end_time: '08:00:00',
        starts_at: '2026-12-01 22:00:00', ends_at: '2026-12-02 08:00:00',
      },
      {
        id: 'r2', staff_id: 'A', facility_id: 'MAHT', date: '2026-12-02',
        kind: 'base', start_time: '10:00:00', end_time: '18:00:00',
        starts_at: '2026-12-02 10:00:00', ends_at: '2026-12-02 18:00:00',
      },
    ]
    const slots: SlotDef[] = [makeSlot('BHJ', 'morning', 1)]
    const requests: RequestEntry[] = [
      { staff_id: 'A', date: '2026-12-01', type: 'night' },
    ]
    const v = runAllChecks({
      shifts,
      slots,
      requests,
      facilityDates: [{ facilityId: 'BHJ', date: '2026-12-01' }],
    })
    const types = v.map(x => x.type)
    expect(types).toContain('interval')
    expect(types).toContain('understaffed')
  })

  it('何も問題なければ空配列', () => {
    const shifts: ShiftEntry[] = [
      {
        id: 'ok1', staff_id: 'A', facility_id: 'BHJ', date: '2026-12-01',
        kind: 'morning', start_time: '08:00:00', end_time: '16:00:00',
        starts_at: '2026-12-01 08:00:00', ends_at: '2026-12-01 16:00:00',
      },
    ]
    const slots: SlotDef[] = [makeSlot('BHJ', 'morning', 1)]
    const v = runAllChecks({
      shifts,
      slots,
      requests: [],
      facilityDates: [{ facilityId: 'BHJ', date: '2026-12-01' }],
    })
    expect(v).toHaveLength(0)
  })
})
