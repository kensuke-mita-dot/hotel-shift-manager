'use server'

import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { revalidatePath } from 'next/cache'
import type { UserRole } from '@/types'

export interface StaffMember {
  id:        string
  fullName:  string
  email:     string
  role:      UserRole
  createdAt: string
}

// ─── スタッフ一覧取得 ─────────────────────────────────────────
export async function fetchStaff(): Promise<{ staff: StaffMember[]; error?: string }> {
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from('profiles')
    .select('id, full_name, email, role, created_at')
    .order('full_name')

  if (error) return { staff: [], error: error.message }

  const staff: StaffMember[] = (data ?? []).map(p => ({
    id:        p.id,
    fullName:  p.full_name,
    email:     p.email ?? '',
    role:      p.role as UserRole,
    createdAt: p.created_at,
  }))

  return { staff }
}

// ─── スタッフ招待 ─────────────────────────────────────────────
export async function inviteStaff(
  email:    string,
  fullName: string,
): Promise<{ error?: string }> {
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
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('profiles')
    .update({ role })
    .eq('id', userId)

  if (error) return { error: error.message }
  revalidatePath('/admin/staff')
  return {}
}

// ─── スタッフ削除 ─────────────────────────────────────────────
export async function removeStaff(userId: string): Promise<{ error?: string }> {
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
