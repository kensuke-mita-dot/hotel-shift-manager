// src/lib/requests.ts
// 希望（shift_requests）は1日に複数入れられる。例：朝と夜のどちらでも可。
// 「休」はほかの希望と同時に指定できない。
import { REQUEST_LABEL } from '@/types'
import type { RequestType } from '@/types'

export interface RequestItem {
  type: RequestType
  start_time?: string | null
  end_time?: string | null
}

export const REQUEST_ORDER: RequestType[] = ['morning', 'evening', 'both', 'night', 'custom', 'off']

const hhmm = (t: string) => t.slice(0, 5)

/** 並び順をそろえ、重複を除き、「休」があれば休だけにする */
export function normalizeRequests<T extends RequestItem>(list: T[]): T[] {
  if (list.some(r => r.type === 'off')) return list.filter(r => r.type === 'off').slice(0, 1)
  const seen = new Set<RequestType>()
  return [...list]
    .sort((a, b) => REQUEST_ORDER.indexOf(a.type) - REQUEST_ORDER.indexOf(b.type))
    .filter(r => (seen.has(r.type) ? false : (seen.add(r.type), true)))
}

/** 表示用の短い文字列（例：「朝・夜」「朝・10:00-15:00」） */
export function requestText(list: RequestItem[], opts: { withTime?: boolean } = {}): string {
  return normalizeRequests(list).map(r =>
    r.type === 'custom' && r.start_time && r.end_time && opts.withTime !== false
      ? `${hhmm(r.start_time)}-${hhmm(r.end_time)}`
      : REQUEST_LABEL[r.type],
  ).join('・')
}

/** 1日分の入力チェック。問題があればメッセージを返す */
export function validateDayRequests(list: RequestItem[]): string | null {
  const types = list.map(r => r.type)
  if (new Set(types).size !== types.length) return '同じ希望が重複しています'
  if (types.includes('off') && types.length > 1) return '「休」はほかの希望と同時に選べません'
  for (const r of list) {
    if (r.type === 'custom' && (!r.start_time || !r.end_time || r.start_time === r.end_time)) {
      return '時間指定は開始と終了の時刻を入れてください'
    }
  }
  return null
}
