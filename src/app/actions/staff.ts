'use server'

import { randomInt } from 'crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/auth-guard'
import { loginIdToEmail } from '@/lib/staff-login'
import { revalidatePath } from 'next/cache'
import type { UserRole } from '@/types'
import { nextMonthJST } from '@/lib/utils'

export interface FacilityBadge {
  facilityId: string
  facilityName: string
  isPrimary: boolean
}

export interface StaffPayInfo {
  hourlyWage: number
  transportType: 'per_shift' | 'monthly'
  transportAmount: number
}

export interface StaffListItem {
  id: string
  fullName: string
  email: string
  /** スタッフのログインID（メールでログインする管理者は null） */
  loginId: string | null
  mustChangePin: boolean
  role: UserRole
  isActive: boolean
  isStaff: boolean   // 管理者がシフトに入る場合 true。role=staff は常に true 扱い
  facilities: FacilityBadge[]
  pay: StaffPayInfo
  submittedAt: string | null
  extendedUntil: string | null
}

// 後方互換
export type StaffMember = StaffListItem

const NO_PAY: StaffPayInfo = { hourlyWage: 0, transportType: 'per_shift', transportAmount: 0 }

// ─── スタッフ一覧（施設・時給・提出状況付き）─────────────────
export async function fetchStaffList(): Promise<{ staff: StaffListItem[]; error?: string }> {
  const guard = await requireAdmin()
  if ('error' in guard) return { staff: [], error: guard.error }

  const admin = createAdminClient()

  const [
    { data: profiles, error: pErr },
    { data: sfs },
    { data: subs },
    { data: pays },
  ] = await Promise.all([
    admin.from('profiles')
      .select('id, full_name, email, login_id, must_change_pin, role, is_active, is_staff')
      .order('full_name'),
    admin.from('staff_facilities').select('staff_id, facility_id, is_primary, facilities(name)'),
    admin.from('request_submissions')
      .select('staff_id, submitted_at, extended_until')
      .eq('month', `${nextMonthJST()}-01`),
    admin.from('staff_pay').select('staff_id, hourly_wage, transport_type, transport_amount'),
  ])

  if (pErr) {
    const hint = /column/.test(pErr.message) ? '（Supabase に 005_launch.sql が未適用の可能性があります）' : ''
    return { staff: [], error: pErr.message + hint }
  }

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
    subMap.set(s.staff_id, { submittedAt: s.submitted_at, extendedUntil: s.extended_until })
  }

  const payMap = new Map<string, StaffPayInfo>()
  for (const p of (pays ?? [])) {
    payMap.set(p.staff_id, {
      hourlyWage: p.hourly_wage,
      transportType: p.transport_type as StaffPayInfo['transportType'],
      transportAmount: p.transport_amount,
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
      loginId: p.login_id ?? null,
      mustChangePin: p.must_change_pin ?? false,
      role: p.role as UserRole,
      isActive: p.is_active,
      isStaff: p.role === 'staff' || (p.is_staff ?? false),
      facilities: facs,
      pay: payMap.get(p.id) ?? NO_PAY,
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

// ─── スタッフ追加（ログインID＋初期PINを発行。メール不要）────────
const newPin = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

/** 主所属の施設コード＋2桁連番（例: BHJ01） */
async function nextLoginId(prefix: string): Promise<string> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('login_id').like('login_id', `${prefix}%`)
  const used = (data ?? [])
    .map(r => r.login_id as string)
    .filter(id => new RegExp(`^${prefix}\\d+$`).test(id))
    .map(id => parseInt(id.slice(prefix.length), 10))
  const next = (used.length ? Math.max(...used) : 0) + 1
  return `${prefix}${String(next).padStart(2, '0')}`
}

export async function createStaff(params: {
  fullName: string
  facilityIds: string[]
  primaryFacilityId: string
}): Promise<{ loginId?: string; pin?: string; error?: string }> {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }

  const name = params.fullName.trim()
  if (!name) return { error: '氏名を入力してください' }
  if (params.facilityIds.length === 0) return { error: '所属施設を選択してください' }
  if (!params.facilityIds.includes(params.primaryFacilityId)) return { error: '主な所属を選択してください' }

  const admin  = createAdminClient()
  const prefix = params.primaryFacilityId.toUpperCase().replace(/[^A-Z]/g, '') || 'STF'

  for (let attempt = 0; attempt < 3; attempt++) {
    const loginId = await nextLoginId(prefix)
    const pin     = newPin()

    const { data, error } = await admin.auth.admin.createUser({
      email:         loginIdToEmail(loginId),
      password:      pin,
      email_confirm: true,           // 確認メールは送らない
      user_metadata: { full_name: name },
    })
    if (error) {
      if (/already|registered|exists/i.test(error.message)) continue
      return { error: error.message }
    }
    const uid = data.user.id

    const { error: profErr } = await admin.from('profiles').upsert({
      id: uid,
      full_name: name,
      email: null,
      role: 'staff',
      is_active: true,
      login_id: loginId,
      must_change_pin: true,
    })
    if (profErr) {
      await admin.auth.admin.deleteUser(uid)
      if (/duplicate|unique/i.test(profErr.message)) continue
      return { error: profErr.message }
    }

    const { error: sfErr } = await admin.from('staff_facilities').upsert(
      params.facilityIds.map(fid => ({
        staff_id: uid, facility_id: fid, is_primary: fid === params.primaryFacilityId,
      })),
      { onConflict: 'staff_id,facility_id' },
    )
    if (sfErr) return { error: `所属施設の登録に失敗: ${sfErr.message}` }

    revalidatePath('/admin/staff')
    return { loginId, pin }
  }
  return { error: 'ログインIDの発行に失敗しました。もう一度お試しください' }
}

// ─── PIN再発行 ────────────────────────────────────────────────
export async function resetPin(userId: string): Promise<{ pin?: string; error?: string }> {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }

  const admin = createAdminClient()
  const { data: prof, error: profErr } = await admin
    .from('profiles').select('login_id').eq('id', userId).single()
  if (profErr) return { error: profErr.message }
  if (!prof?.login_id) return { error: 'このアカウントはメールでログインするためPINはありません' }

  const pin = newPin()
  const { error } = await admin.auth.admin.updateUserById(userId, { password: pin })
  if (error) return { error: error.message }

  await admin.from('profiles').update({ must_change_pin: true }).eq('id', userId)
  revalidatePath('/admin/staff')
  return { pin }
}

// ─── 所属施設・時給・交通費の更新 ──────────────────────────────
export async function updateStaffSettings(
  staffId: string,
  settings: { facilityIds: string[]; primaryFacilityId: string | null; pay: StaffPayInfo },
): Promise<{ error?: string }> {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }

  const { facilityIds, primaryFacilityId, pay } = settings
  if (facilityIds.length > 0 && (!primaryFacilityId || !facilityIds.includes(primaryFacilityId))) {
    return { error: '主な所属を選択してください' }
  }
  const wage      = Math.round(Number(pay.hourlyWage))
  const transport = Math.round(Number(pay.transportAmount))
  if (!Number.isFinite(wage) || wage < 0)           return { error: '時給は0以上の数値で入力してください' }
  if (!Number.isFinite(transport) || transport < 0) return { error: '交通費は0以上の数値で入力してください' }
  if (pay.transportType !== 'per_shift' && pay.transportType !== 'monthly') return { error: '交通費の区分が不正です' }

  const admin = createAdminClient()

  // 所属：外したものを削除 → 主所属を一旦外す → 付け直す（主所属の一意制約に引っかからない順）
  const { data: current } = await admin.from('staff_facilities').select('facility_id').eq('staff_id', staffId)
  const removed = (current ?? []).map(r => r.facility_id).filter(fid => !facilityIds.includes(fid))
  if (removed.length > 0) {
    const { error } = await admin.from('staff_facilities').delete().eq('staff_id', staffId).in('facility_id', removed)
    if (error) return { error: error.message }
  }
  if (facilityIds.length > 0) {
    await admin.from('staff_facilities').update({ is_primary: false }).eq('staff_id', staffId)
    const { error } = await admin.from('staff_facilities').upsert(
      facilityIds.map(fid => ({ staff_id: staffId, facility_id: fid, is_primary: fid === primaryFacilityId })),
      { onConflict: 'staff_id,facility_id' },
    )
    if (error) return { error: error.message }
  }

  const { error: payErr } = await admin.from('staff_pay').upsert({
    staff_id: staffId,
    hourly_wage: wage,
    transport_type: pay.transportType,
    transport_amount: transport,
    updated_at: new Date().toISOString(),
  })
  if (payErr) return { error: payErr.message }

  revalidatePath('/admin/staff')
  revalidatePath('/admin/cost')
  return {}
}

// ─── 提出期限の延長（null で取り消し）────────────────────────
export async function extendDeadline(
  staffId: string,
  extendedUntil: string | null,
): Promise<{ error?: string }> {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }

  const admin = createAdminClient()
  const { error } = await admin.from('request_submissions').upsert(
    { staff_id: staffId, month: `${nextMonthJST()}-01`, extended_until: extendedUntil },
    { onConflict: 'staff_id,month' }
  )
  if (error) return { error: error.message }
  revalidatePath('/admin/staff')
  return {}
}

// ─── 停止 / 復帰 ──────────────────────────────────────────────
export async function setStaffActive(staffId: string, isActive: boolean): Promise<{ error?: string }> {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }
  if (guard.userId === staffId) return { error: '自分自身は停止できません' }

  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ is_active: isActive }).eq('id', staffId)
  if (error) return { error: error.message }
  revalidatePath('/admin/staff')
  return {}
}

// ─── is_staff の切り替え（管理者がシフトに入るか） ───────────────
export async function setIsStaff(staffId: string, isStaff: boolean): Promise<{ error?: string }> {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }

  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ is_staff: isStaff }).eq('id', staffId)
  if (error) return { error: error.message }
  revalidatePath('/admin/staff')
  return {}
}

// ─── ロール変更 ────────────────────────────────────────────────
export async function updateRole(userId: string, role: UserRole): Promise<{ error?: string }> {
  const guard = await requireAdmin()
  if ('error' in guard) return { error: guard.error }
  if (guard.userId === userId) return { error: '自分のロールは変更できません' }

  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ role }).eq('id', userId)
  if (error) return { error: error.message }
  revalidatePath('/admin/staff')
  return {}
}
