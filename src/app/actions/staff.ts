'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { randomInt } from 'crypto'
import { loginIdToEmail } from '@/lib/staff-login'
import type { UserRole, TransportType } from '@/types'

export interface StaffMember {
  id:              string
  fullName:        string
  email:           string
  /** スタッフのログインID（管理者などメールでログインする人は null） */
  loginId:         string | null
  mustChangePin:   boolean
  role:            UserRole
  createdAt:       string
  facility:        string | null
  hourlyWage:      number
  transportType:   TransportType
  transportAmount: number
}

export interface PaySettings {
  facility:        string | null
  hourlyWage:      number
  transportType:   TransportType
  transportAmount: number
}

// ─── スタッフ一覧取得 ─────────────────────────────────────────
export async function fetchStaff(): Promise<{ staff: StaffMember[]; error?: string }> {
  const guard = await requireAdmin()
  if ('error' in guard) return { staff: [], error: guard.error }

  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from('profiles')
    .select('id, full_name, email, login_id, must_change_pin, role, created_at, facility, hourly_wage, transport_type, transport_amount')
    .order('full_name')

  if (error) {
    const hint = error.message.includes('column')
      ? '（Supabase に 003 / 004 の migration が未適用の可能性があります）'
      : ''
    return { staff: [], error: error.message + hint }
  }

  const staff: StaffMember[] = (data ?? []).map(p => ({
    id:              p.id,
    fullName:        p.full_name,
    email:           p.email ?? '',
    loginId:         p.login_id ?? null,
    mustChangePin:   p.must_change_pin ?? false,
    role:            p.role as UserRole,
    createdAt:       p.created_at,
    facility:        p.facility ?? null,
    hourlyWage:      p.hourly_wage ?? 0,
    transportType:   (p.transport_type ?? 'per_day') as TransportType,
    transportAmount: p.transport_amount ?? 0,
  }))

  return { staff }
}

// ─── スタッフ追加（ログインID＋初期PINを発行） ────────────────
const newPin = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

/** 施設コード＋2桁連番（例: BHJ01）。施設未設定は STF01〜 */
async function nextLoginId(prefix: string): Promise<string> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('profiles')
    .select('login_id')
    .like('login_id', `${prefix}%`)
  const used = (data ?? [])
    .map(r => r.login_id as string)
    .filter(id => new RegExp(`^${prefix}\\d+$`).test(id))
    .map(id => parseInt(id.slice(prefix.length), 10))
  const next = (used.length ? Math.max(...used) : 0) + 1
  return `${prefix}${String(next).padStart(2, '0')}`
}

export async function createStaff(
  fullName: string,
  facility: string | null,
): Promise<{ loginId?: string; pin?: string; error?: string }> {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }

  const name = fullName.trim()
  if (!name) return { error: '氏名を入力してください' }

  const adminClient = createAdminClient()
  const prefix = (facility || 'STF').toUpperCase().replace(/[^A-Z]/g, '') || 'STF'

  // 連番の取り合いに備えて数回までリトライ
  for (let attempt = 0; attempt < 3; attempt++) {
    const loginId = await nextLoginId(prefix)
    const pin     = newPin()

    const { data, error } = await adminClient.auth.admin.createUser({
      email:         loginIdToEmail(loginId),
      password:      pin,
      email_confirm: true,           // 確認メールは送らない
      user_metadata: { full_name: name },
    })
    if (error) {
      if (/already|registered|exists/i.test(error.message)) continue
      return { error: error.message }
    }

    const { error: profErr } = await adminClient
      .from('profiles')
      .upsert({
        id:              data.user.id,
        full_name:       name,
        role:            'staff',
        facility:        facility || null,
        login_id:        loginId,
        must_change_pin: true,
        email:           null,
      })
    if (profErr) {
      // プロフィールが作れなければ Auth ユーザーも消して元に戻す
      await adminClient.auth.admin.deleteUser(data.user.id)
      if (/duplicate|unique/i.test(profErr.message)) continue
      return { error: profErr.message }
    }

    revalidatePath('/admin/staff')
    return { loginId, pin }
  }
  return { error: 'ログインIDの発行に失敗しました。もう一度お試しください' }
}

// ─── PIN再発行 ────────────────────────────────────────────────
export async function resetPin(userId: string): Promise<{ pin?: string; error?: string }> {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }

  const adminClient = createAdminClient()
  const { data: prof, error: profErr } = await adminClient
    .from('profiles')
    .select('login_id')
    .eq('id', userId)
    .single()
  if (profErr) return { error: profErr.message }
  if (!prof?.login_id) return { error: 'このアカウントはメールでログインするためPINはありません' }

  const pin = newPin()
  const { error } = await adminClient.auth.admin.updateUserById(userId, { password: pin })
  if (error) return { error: error.message }

  await adminClient.from('profiles').update({ must_change_pin: true }).eq('id', userId)
  revalidatePath('/admin/staff')
  return { pin }
}

// ─── ロール変更 ───────────────────────────────────────────────
export async function updateRole(
  userId: string,
  role:   UserRole,
): Promise<{ error?: string }> {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }
  if (guard.userId === userId) return { error: '自分のロールは変更できません' }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('profiles')
    .update({ role })
    .eq('id', userId)

  if (error) return { error: error.message }
  revalidatePath('/admin/staff')
  return {}
}

// ─── 施設・時給・交通費の更新 ─────────────────────────────────
export async function updatePaySettings(
  userId:   string,
  settings: PaySettings,
): Promise<{ error?: string }> {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }

  const wage      = Math.round(Number(settings.hourlyWage))
  const transport = Math.round(Number(settings.transportAmount))
  if (!Number.isFinite(wage) || wage < 0)           return { error: '時給は0以上の数値で入力してください' }
  if (!Number.isFinite(transport) || transport < 0) return { error: '交通費は0以上の数値で入力してください' }
  if (settings.transportType !== 'per_day' && settings.transportType !== 'monthly') {
    return { error: '交通費の区分が不正です' }
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('profiles')
    .update({
      facility:         settings.facility || null,
      hourly_wage:      wage,
      transport_type:   settings.transportType,
      transport_amount: transport,
    })
    .eq('id', userId)

  if (error) return { error: error.message }
  revalidatePath('/admin/staff')
  revalidatePath('/admin/cost')
  return {}
}

// ─── スタッフ削除 ─────────────────────────────────────────────
export async function removeStaff(userId: string): Promise<{ error?: string }> {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }
  if (guard.userId === userId) return { error: '自分自身は削除できません' }

  try {
    const adminClient = createAdminClient()
    const { error } = await adminClient.auth.admin.deleteUser(userId)
    if (error) return { error: error.message }

    revalidatePath('/admin/staff')
    return {}
  } catch (e: any) {
    return { error: e.message }
  }
}
