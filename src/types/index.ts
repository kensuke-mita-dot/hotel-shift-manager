// ============================================================
// 型定義 — v2スキーマ対応（複数施設・兼任・施設ごとの枠）
// ============================================================

// ─── Enum 型 ──────────────────────────────────────────────
export type RequestType = 'morning' | 'evening' | 'both' | 'night' | 'off' | 'custom'
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
  department?:      string | null
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

// ─── AI下書き（Phase 2 用に残す） ─────────────────────────
export interface AiDraftRun {
  id:             string
  triggered_by:   string
  target_month:   string
  model_name:     string
  prompt_tokens?: number | null
  status:         'pending' | 'running' | 'done' | 'error'
  error_message?: string | null
  created_at:     string
  finished_at?:   string | null
}

// ─── UI 用の集約型 ────────────────────────────────────────

/** 希望入力画面のカレンダーマス */
export interface RequestCellData {
  date:       string
  type:       RequestType | null   // null = 空欄
  start_time: string | null
  end_time:   string | null
}

/** 日次調整画面のスタッフ行 */
export interface StaffForDay {
  staffId:     string
  fullName:    string
  request:     Pick<ShiftRequest, 'type' | 'start_time' | 'end_time'> | null
  /** この施設・この日の配置状態 */
  assignedHere: { kind: string; start_time: string; end_time: string } | null
  /** 他施設に配置済みの場合 */
  assignedElsewhere: { facility_id: string; kind: string } | null
}

/** チェック違反 */
export interface Violation {
  type:      'interval' | 'overlap' | 'understaffed'
  shiftId:   string
  staffId?:  string
  message:   string
}

// ─── 対象月（Phase 1 固定：12月） ─────────────────────────
export const TARGET_MONTH = '2026-12-01' as const  // 12月固定。後で動的化

/** 希望入力の略称ラベル */
export const REQUEST_LABEL: Record<RequestType, string> = {
  morning: '朝',
  evening: '夕',
  both:    '朝夕',
  night:   '夜',
  custom:  '時間',
  off:     '休',
}
