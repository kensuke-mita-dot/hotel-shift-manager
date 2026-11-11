'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import type { UserRole, TransportType } from '@/types'

export interface StaffMember {
  id:              string
  fullName:        string
  email:           string
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
    .select('id, full_name, email, role, created_at, facility, hourly_wage, transport_type, transport_amount')
    .order('full_name')

  if (error) return { staff: [], error: error.message }

  const staff: StaffMember[] = (data ?? []).map(p => ({
    id:              p.id,
    fullName:        p.full_name,
    email:           p.email ?? '',
    role:            p.role as UserRole,
    createdAt:       p.created_at,
    facility:        p.facility ?? null,
    hourlyWage:      p.hourly_wage ?? 0,
    transportType:   (p.transport_type ?? 'per_day') as TransportType,
    transportAmount: p.transport_amount ?? 0,
  }))

  return { staff }
}

// ─── スタッフ招待 ─────────────────────────────────────────────
export async function inviteStaff(
  email:    string,
  fullName: string,
): Promise<{ error?: string }> {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }

  try {
    const adminClient = createAdminClient()

    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
    })
    if (error) return { error: error.message }

    // trigger が動くが full_name・email・role を確実にセット
    if (data.user) {
      await adminClient
        .from('profiles')
        .upsert({ id: data.user.id, full_name: fullName, email: email.trim(), role: 'staff' })
    }

    revalidatePath('/admin/staff')
    return {}
  } catch (e: any) {
    return { error: e.message }
  }
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
