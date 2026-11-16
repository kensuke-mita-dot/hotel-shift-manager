// src/lib/requests.ts
// 希望（shift_requests）は1日に複数入れられる。例：朝と夜のどちらでも可。
// 時間指定は1日に2つまで（例：08:00-13:00 と 14:30-22:00）。
// 「休」はほかの希望と同時に指定できない。
import { REQUEST_LABEL } from '@/types'
import type { RequestType } from '@/types'

export interface RequestItem {
  type: RequestType
  start_time?: string | null
  end_time?: string | null
}

export const REQUEST_ORDER: RequestType[] = ['morning', 'evening', 'both', 'night', 'custom', 'off', 'paid_leave']

/** ほかの希望と同時に選べない種類（×＝入れない、有給） */
export const EXCLUSIVE_REQUESTS: RequestType[] = ['off', 'paid_leave']

/** 時間指定の上限（1日あたり） */
export const MAX_TIME_RANGES = 2

const hhmm = (t: string) => t.slice(0, 5)
const keyOf = (r: RequestItem) => (r.type === 'custom' ? `custom|${hhmm(r.start_time ?? '')}` : r.type)

/** 並び順をそろえ、重複を除き、「×」「有給」があればそれだけにする（時間指定は開始時刻順） */
export function normalizeRequests<T extends RequestItem>(list: T[]): T[] {
  const ex = list.find(r => EXCLUSIVE_REQUESTS.includes(r.type))
  if (ex) return [ex]
  const seen = new Set<string>()
  return [...list]
    .sort((a, b) =>
      REQUEST_ORDER.indexOf(a.type) - REQUEST_ORDER.indexOf(b.type)
      || (a.start_time ?? '').localeCompare(b.start_time ?? ''))
    .filter(r => {
      const k = keyOf(r)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
}

/** 表示用の短い文字列（例：「朝・夜」「朝・10:00-15:00」）。withTime:false なら種類名だけ（重複なし） */
export function requestText(list: RequestItem[], opts: { withTime?: boolean } = {}): string {
  const norm = normalizeRequests(list)
  if (opts.withTime === false) {
    return Array.from(new Set(norm.map(r => REQUEST_LABEL[r.type]))).join('・')
  }
  return norm.map(r =>
    r.type === 'custom' && r.start_time && r.end_time
      ? `${hhmm(r.start_time)}-${hhmm(r.end_time)}`
      : REQUEST_LABEL[r.type],
  ).join('・')
}

/** 'HH:MM' → 分。終了が開始以前なら日をまたぐとみなす */
function range(r: RequestItem): [number, number] {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const s = toMin(r.start_time!)
  let e = toMin(r.end_time!)
  if (e <= s) e += 24 * 60
  return [s, e]
}

/** 1日分の入力チェック。問題があればメッセージを返す */
export function validateDayRequests(list: RequestItem[]): string | null {
  const types = list.map(r => r.type)
  if (types.some(t => EXCLUSIVE_REQUESTS.includes(t)) && types.length > 1) return '「×」「有給」はほかの希望と同時に選べません'

  const fixed = types.filter(t => t !== 'custom')
  if (new Set(fixed).size !== fixed.length) return '同じ希望が重複しています'

  const customs = list.filter(r => r.type === 'custom')
  for (const r of customs) {
    if (!r.start_time || !r.end_time || hhmm(r.start_time) === hhmm(r.end_time)) {
      return '時間指定は開始と終了の時刻を入れてください'
    }
  }
  if (customs.length > MAX_TIME_RANGES) return `時間指定は1日${MAX_TIME_RANGES}つまでです`
  if (customs.length === 2) {
    const [a, b] = customs.map(range).sort((x, y) => x[0] - y[0])
    if (a[0] === b[0]) return '同じ時間指定が重複しています'
    if (b[0] < a[1]) return '2つの時間指定が重なっています'
  }
  return null
}

/**
 * 希望の採用状況（1人分・1か月分）。
 * 「勤務の希望（×・有給以外）を出した日」のうち、どこかの施設で勤務が入った日を採用とする。
 * 朝希望で夕に入った場合も採用に数える。
 */
export function adoptionStats(
  requests: { date: string; type: RequestType }[],
  shifts: { date: string; kind: string }[],
): { requested: number; adopted: number } {
  const wanted = new Set(requests.filter(r => !EXCLUSIVE_REQUESTS.includes(r.type)).map(r => r.date))
  const worked = new Set(shifts.filter(s => s.kind !== 'off' && s.kind !== 'paid_leave').map(s => s.date))
  let adopted = 0
  wanted.forEach(d => { if (worked.has(d)) adopted++ })
  return { requested: wanted.size, adopted }
}
