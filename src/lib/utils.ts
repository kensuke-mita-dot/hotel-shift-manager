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

/** 日本時間の今月 'YYYY-MM' */
export function currentMonthJST(): string {
  return todayJST().slice(0, 7)
}

/** 日本時間の来月 'YYYY-MM'（シフトを組む対象の月の初期値） */
export function nextMonthJST(): string {
  const [y, m] = currentMonthJST().split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/** スタッフ一覧の施設の並び順（主な所属でまとめる） */
export const FACILITY_ORDER = ['BHJ', 'MAHT', 'BHKK', 'MAHNM', 'MAHB'] as const

export function facilityRank(id: string | null | undefined): number {
  if (!id) return FACILITY_ORDER.length + 1
  const i = (FACILITY_ORDER as readonly string[]).indexOf(id)
  return i === -1 ? FACILITY_ORDER.length : i
}

/** 同じ施設内の並び：ログインID順（BHJ01, BHJ02…）、IDのない人（管理者）は後ろに名前順 */
export function compareByLoginId(
  a: { loginId: string | null; fullName: string },
  b: { loginId: string | null; fullName: string },
): number {
  if (a.loginId && b.loginId) return a.loginId.localeCompare(b.loginId, 'en', { numeric: true })
  if (a.loginId) return -1
  if (b.loginId) return 1
  return a.fullName.localeCompare(b.fullName, 'ja')
}

/** 同じ施設内の並び：管理者を先頭に、その後ろにスタッフをログインID順 */
export function compareStaffInFacility(
  a: { isAdmin: boolean; loginId: string | null; fullName: string },
  b: { isAdmin: boolean; loginId: string | null; fullName: string },
): number {
  if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1
  return compareByLoginId(a, b)
}

/** 所属施設を短く表示（主な所属＋ほかの数。例：「BHJ ほか4」） */
export function facilitySummary(s: { primaryFacilityId: string | null; facilityIds: string[] }): string {
  const main = s.primaryFacilityId ?? s.facilityIds[0]
  if (!main) return '施設未設定'
  const others = s.facilityIds.length - 1
  return others > 0 ? `${main} ほか${others}` : main
}

/** 主な所属（なければ最初の所属） */
export function mainFacility(s: { primaryFacilityId: string | null; facilityIds: string[] }): string | null {
  return s.primaryFacilityId ?? s.facilityIds[0] ?? null
}
