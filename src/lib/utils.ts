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
