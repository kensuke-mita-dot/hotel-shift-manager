import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 日本時間の今日を 'YYYY-MM-DD' で返す（サーバーはUTCで動くため） */
export function todayJST(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
}

/** 円表記（例: ¥123,456） */
export function yen(n: number): string {
  return '¥' + Math.round(n).toLocaleString('ja-JP')
}

/** 'YYYY-MM-DD' に日数を足す（タイムゾーンの影響を受けない） */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return t.toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' の曜日（0=日） */
export function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export const WEEK_JA = ['日', '月', '火', '水', '木', '金', '土']

/** 'YYYY-MM' の月初と月末 */
export function monthRange(month: string): { from: string; to: string; days: number } {
  const [y, m] = month.split('-').map(Number)
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(days)}`, days }
}
