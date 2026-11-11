// ============================================================
// 型定義 — hotel-shift/src/types/index.ts
// ============================================================

export type ShiftSlot = 'morning' | 'evening' | 'night'
export type WishType  = 'morning' | 'evening' | 'night' | 'off'
export type UserRole  = 'staff' | 'admin'

// ─── スロット定数 ─────────────────────────────────────────
export const SLOT_META: Record<ShiftSlot, {
  label: string
  time: string
  color: string        // Tailwind / hex
  badge: string
}> = {
  morning: { label: '朝勤', time: '08:00〜16:00', color: '#EF9F27', badge: 'bg-amber-100 text-amber-800' },
  evening: { label: '夕勤', time: '14:00〜22:00', color: '#378ADD', badge: 'bg-blue-100 text-blue-800'   },
  night:   { label: '夜勤', time: '22:00〜08:00', color: '#534AB7', badge: 'bg-purple-100 text-purple-800' },
}

// ─── 施設 ─────────────────────────────────────────────────
export const FACILITIES = [
  { code: 'BHJ',   name: 'BOOK HOTEL 神保町' },
  { code: 'BHKK',  name: 'BOOK HOTEL 京都九条' },
  { code: 'MAHT',  name: 'MANGA ART HOTEL TOKYO' },
  { code: 'MAHB',  name: 'MANGA ART HOTEL BAKUROCHO' },
  { code: 'MAHNM', name: 'MANGA ART HOTEL NAGOYA MARUNOUCHI' },
] as const

export type TransportType = 'per_day' | 'monthly'

/**
 * 人件費計算用のスロット別労働時間。
 * 休憩1時間を差し引いた実働時間と、そのうち深夜（22:00〜05:00）にかかる時間。
 * 夜勤の休憩は深夜帯に取る前提。運用に合わせてここを変えれば全画面に反映される。
 */
export const SLOT_HOURS: Record<ShiftSlot, { paid: number; lateNight: number }> = {
  morning: { paid: 7, lateNight: 0 },  // 08:00〜16:00（休憩1h）
  evening: { paid: 7, lateNight: 0 },  // 14:00〜22:00（休憩1h）
  night:   { paid: 9, lateNight: 6 },  // 22:00〜08:00（休憩1h、深夜7h−休憩1h）
}

/** 深夜割増率（労基法の下限 25%） */
export const LATE_NIGHT_PREMIUM = 0.25

export const WISH_LABEL: Record<WishType, string> = {
  morning: '朝希望',
  evening: '夕希望',
  night:   '夜希望',
  off:     '休希望',
}

// ─── DB 型（Supabaseが自動生成する型に近い形） ───────────
export interface Profile {
  id:          string
  full_name:   string
  role:        UserRole
  department?: string | null
  created_at:  string
  updated_at:  string
}

export interface ShiftWish {
  id:         string
  staff_id:   string
  wish_date:  string          // 'YYYY-MM-DD'
  wish:       WishType
  note?:      string | null
  created_at: string
  updated_at: string
}

export interface Shift {
  id:           string
  staff_id:     string
  shift_date:   string        // 'YYYY-MM-DD'
  slot:         ShiftSlot
  is_confirmed: boolean
  note?:        string | null
  ai_suggested: boolean
  ai_model?:    string | null
  ai_run_id?:   string | null
  created_at:   string
  updated_at:   string
}

export interface AiDraftRun {
  id:           string
  triggered_by: string
  target_month: string        // 対象月初日
  model_name:   string
  prompt_tokens?: number | null
  status:       'pending' | 'running' | 'done' | 'error'
  error_message?: string | null
  created_at:   string
  finished_at?: string | null
}

// ─── UI 用の集約型 ────────────────────────────────────────
/** 管理者の日次調整画面で使う1日分のシフト状態 */
export interface DayAssignment {
  date: string
  morning: StaffWithWish[]
  evening: StaffWithWish[]
  night:   StaffWithWish[]
}

/** プールまたはスロットに表示するスタッフ情報 */
export interface StaffWithWish {
  staffId:   string
  fullName:  string
  wish:      WishType
  /** 前日の担当スロット（夜勤明け朝勤NGチェック用） */
  prevSlot?: ShiftSlot | null
  shiftId?:  string | null     // 既存シフトID（更新時に使用）
}

/** バリデーション結果 */
export interface ValidationResult {
  hasEmptySlot:  boolean
  ngPatterns:    { staffName: string; slot: ShiftSlot }[]
  isValid:       boolean
}

// ─── AI自動生成API用リクエスト型 ─────────────────────────
export interface AiDraftRequest {
  targetMonth: string          // 'YYYY-MM'
  wishes:      ShiftWish[]
  profiles:    Profile[]
  existingShifts: Shift[]
}

export interface AiDraftResponse {
  runId:   string
  shifts:  Omit<Shift, 'id' | 'created_at' | 'updated_at'>[]
  warnings: string[]
}
