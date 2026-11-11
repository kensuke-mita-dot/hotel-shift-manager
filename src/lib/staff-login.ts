// src/lib/staff-login.ts
// スタッフのログインID ⇔ Supabase Auth 用ダミーアドレスの変換
// （.invalid は RFC 2606 で予約された実在しないドメイン。メールは送られない）

export const STAFF_EMAIL_DOMAIN = 'staff.hotel-shift.invalid'

/** 入力ゆれ（小文字・全角・空白）を吸収してログインIDを正規化 */
export function normalizeLoginId(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toUpperCase()
}

export function loginIdToEmail(loginId: string): string {
  return `${normalizeLoginId(loginId).toLowerCase()}@${STAFF_EMAIL_DOMAIN}`
}

export const PIN_PATTERN = /^\d{6}$/
