'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import { revalidatePath } from 'next/cache'
import type { UserRole } from '@/types'
import { TARGET_MONTH } from '@/types'

export interface FacilityBadge {
  facilityId: string
  facilityName: string
  isPrimary: boolean
}

export interface StaffListItem {
  id: string
  fullName: string
  email: string
  role: UserRole
  isActive: boolean
  isStaff: boolean   // 管理者がシフトに入る場合 true。role=staff は常に true 扱い
  facilities: FacilityBadge[]
  submittedAt: string | null
  extendedUntil: string | null
}

// 後方互換
export type StaffMember = StaffListItem

// ─── スタッフ一覧（施設・提出状況付き）────────────────────────
export async function fetchStaffList(): Promise<{ staff: StaffListItem[]; error?: string }> {
  const admin = createAdminClient()

  const [
    { data: profiles, error: pErr },
    { data: sfs },
    { data: subs },
  ] = await Promise.all([
    admin.from('profiles')
      .select('id, full_name, email, role, is_active, is_staff')
      .order('full_name'),
    admin.from('staff_facilities').select('staff_id, facility_id, is_primary, facilities(name)'),
    admin.from('request_submissions')
      .select('staff_id, submitted_at, extended_until')
      .eq('month', TARGET_MONTH),
  ])

  if (pErr) return { staff: [], error: pErr.message }

  const sfMap = new Map<string, FacilityBadge[]>()
  for (const sf of (sfs ?? [])) {
    const arr = sfMap.get(sf.staff_id) ?? []
    arr.push({
      facilityId: sf.facility_id,
      facilityName: (sf.facilities as unknown as { name: string } | null)?.name ?? sf.facility_id,
      isPrimary: sf.is_primary,
    })
    sfMap.set(sf.staff_id, arr)
  }

  const subMap = new Map<string, { submittedAt: string | null; extendedUntil: string | null }>()
  for (const s of (subs ?? [])) {
    subMap.set(s.staff_id, {
      submittedAt: s.submitted_at,
      extendedUntil: s.extended_until,
    })
  }

  const staff: StaffListItem[] = (profiles ?? []).map(p => {
    const sub = subMap.get(p.id)
    const facs = (sfMap.get(p.id) ?? []).sort(
      (a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0)
    )
    return {
      id: p.id,
      fullName: p.full_name,
      email: p.email ?? '',
      role: p.role as UserRole,
      isActive: p.is_active,
      isStaff: p.role === 'staff' || (p.is_staff ?? false),
      facilities: facs,
      submittedAt: sub?.submittedAt ?? null,
      extendedUntil: sub?.extendedUntil ?? null,
    }
  })

  return { staff }
}

// 後方互換
export async function fetchStaff() {
  return fetchStaffList()
}

// ─── スタッフ招待（施設付き）──────────────────────────────────
export async function inviteStaff(
  email: string,
  fullName: string,
  facilityIds?: string[],
  primaryFacilityId?: string,
): Promise<{ error?: string }> {
  try {
    const admin = createAdminClient()

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email.trim(), {
      data: { full_name: fullName.trim() },
    })
    if (error) return { error: error.message }

    if (data.user) {
      const uid = data.user.id

      await admin.from('profiles').upsert({
        id: uid,
        full_name: fullName.trim(),
        email: email.trim(),
        role: 'staff',
        is_active: true,
      })

      if (facilityIds && facilityIds.length > 0) {
        await admin.from('staff_facilities').upsert(
          facilityIds.map(fid => ({
            staff_id: uid,
            facility_id: fid,
            is_primary: fid === primaryFacilityId,
          })),
          { onConflict: 'staff_id,facility_id' }
        )
      }
    }

    revalidatePath('/admin/staff')
    return {}
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { error: msg }
  }
}

// ─── 提出期限の延長（null で取り消し）────────────────────────
export async function extendDeadline(
  staffId: string,
  extendedUntil: string | null,
): Promise<{ error?: string }> {
  const admin = createAdminClient()

  const { error } = await admin.from('request_submissions').upsert(
    { staff_id: staffId, month: TARGET_MONTH, extended_until: extendedUntil },
    { onConflict: 'staff_id,month' }
  )

  if (error) return { error: error.message }
  revalidatePath('/admin/staff')
  return {}
}

// ─── 停止 / 復帰 ──────────────────────────────────────────────
export async function setStaffActive(
  staffId: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', staffId)

  if (error) return { error: error.message }
  revalidatePath('/admin/staff')
  return {}
}

// ─── is_staff の切り替え（管理者がシフトに入るか） ───────────────
export async function setIsStaff(
  staffId: string,
  isStaff: boolean,
): Promise<{ error?: string }> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ is_staff: isStaff })
    .eq('id', staffId)
  if (error) return { error: error.message }
  revalidatePath('/admin/staff')
  return {}
}

// ─── ロール変更 ────────────────────────────────────────────────
export async function updateRole(
  userId: string,
  role: UserRole,
): Promise<{ error?: string }> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ role })
    .eq('id', userId)

  if (error) return { error: error.message }
  revalidatePath('/admin/staff')
  return {}
}

// 後方互換（ハード削除は残すが UI には出さない）
export async function removeStaff(userId: string): Promise<{ error?: string }> {
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return { error: error.message }
  revalidatePath('/admin/staff')
  return {}
}
