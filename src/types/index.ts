// ============================================================
// 型定義 — v2スキーマ対応（複数施設・兼任・施設ごとの枠）
// ============================================================

// ─── Enum 型 ──────────────────────────────────────────────
export type RequestType = 'morning' | 'evening' | 'both' | 'night' | 'off' | 'paid_leave' | 'custom'
export type ShiftSource = 'staff_request' | 'admin' | 'ai_draft'
export type ShiftStatus = 'draft' | 'confirmed'
export type UserRole    = 'staff' | 'admin'

// ─── 施設・枠 ─────────────────────────────────────────────
export interface Facility {
  id:   string   // 'BHJ' など
  name: string
  sort: number
}

export interface FacilitySlot {
  id:          string
  facility_id: string
  key:         string   // 'morning' | 'evening' | 'night' | 'base'
  label:       string   // 朝 | 夕 | 夜 | 基本
  start_time:  string   // 'HH:MM'
  end_time:    string   // 'HH:MM'（end <= start は翌日終了）
  min_staff:   number
  sort:        number
}

export interface MinOverride {
  facility_id: string
  date:        string
  slot_key:    string
  min_staff:   number
}

// ─── スタッフ ─────────────────────────────────────────────
export interface Profile {
  id:               string
  full_name:        string
  email:            string | null
  role:             UserRole
  is_active:        boolean
  hire_date:        string | null
  cum_days_initial: number
  /** スタッフのログインID（管理者は null） */
  login_id:         string | null
  /** 初期PIN・再発行PINのまま（ログイン後にPIN変更を求める） */
  must_change_pin:  boolean
  /** 管理者がシフトに入る場合 true */
  is_staff:         boolean
  created_at:       string
  updated_at:       string
}

export interface StaffPay {
  staff_id:         string
  hourly_wage:      number
  transport_type:   'per_shift' | 'monthly'
  transport_amount: number
  updated_at:       string
}

export interface StaffFacility {
  staff_id:    string
  facility_id: string
  is_primary:  boolean
}

// ─── 希望 ─────────────────────────────────────────────────
export interface ShiftRequest {
  id:         string
  staff_id:   string
  date:       string         // 'YYYY-MM-DD'
  type:       RequestType
  start_time: string | null  // custom のときだけ
  end_time:   string | null
  updated_at: string
}

export interface RequestSubmission {
  staff_id:       string
  month:          string   // 対象月の1日 'YYYY-MM-01'
  submitted_at:   string | null
  extended_until: string | null
}

// ─── シフト（下書き・公開版） ─────────────────────────────
export interface Shift {
  id:          string
  facility_id: string
  staff_id:    string
  date:        string
  kind:        string         // 枠の key または 'custom'
  start_time:  string
  end_time:    string
  starts_at:   string         // timestamp（自動計算）
  ends_at:     string
  source:      ShiftSource
  status:      ShiftStatus
  updated_by:  string | null
  updated_at:  string
}

export interface PublishedShift {
  id:           string
  facility_id:  string
  staff_id:     string
  date:         string
  kind:         string
  start_time:   string
  end_time:     string
  starts_at:    string
  ends_at:      string
  published_at: string
  published_by: string | null
}

/** チェック違反 */
export interface Violation {
  type:      'interval' | 'overlap' | 'understaffed'
  shiftId:   string
  staffId?:  string
  message:   string
}

// ─── 希望入力 ─────────────────────────────────────────────
/**
 * スタッフの希望入力（提出・期限延長）を使うか。
 * false にするとスタッフ側の希望入力タブ、スタッフ管理の提出状況・期限延長の列を隠す。
 */
export const REQUESTS_ENABLED = true

/** 希望入力の略称ラベル */
export const REQUEST_LABEL: Record<RequestType, string> = {
  morning: '朝',
  evening: '夕',
  both:    '朝夕',
  night:   '夜',
  custom:  '時間',
  off:     '×',
  paid_leave: '有給',
}
