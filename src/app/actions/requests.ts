'use server'

import { createClient } from '@/lib/supabase-server'
import type { RequestType, ShiftRequest, FacilitySlot } from '@/types'
import { TARGET_MONTH } from '@/types'
import { revalidatePath } from 'next/cache'

export interface RequestsPageData {
  requests: ShiftRequest[]
  submittedAt: string | null
  extendedUntil: string | null
  primaryFacilitySlots: FacilitySlot[]
  availableSlotKeys: string[]
  deadlineDate: string
}

export async function fetchRequestsData(userId: string): Promise<RequestsPageData> {
  const supabase = createClient()

  const [requestsRes, submissionRes, facilitiesRes] = await Promise.all([
    supabase.from('shift_requests').select('*').eq('staff_id', userId).gte('date', '2026-12-01').lte('date', '2026-12-31'),
    supabase.from('request_submissions').select('submitted_at, extended_until').eq('staff_id', userId).eq('month', TARGET_MONTH).maybeSingle(),
    supabase.from('staff_facilities').select('facility_id, is_primary').eq('staff_id', userId),
  ])

  const facilities = facilitiesRes.data ?? []
  const facilityIds = facilities.map((f: { facility_id: string }) => f.facility_id)
  const primaryFacilityId = facilities.find((f: { is_primary: boolean }) => f.is_primary)?.facility_id
    ?? facilityIds[0]
    ?? null

  let primaryFacilitySlots: FacilitySlot[] = []
  let availableSlotKeys: string[] = []

  if (facilityIds.length > 0) {
    const slotsRes = await supabase.from('facility_slots').select('*').in('facility_id', facilityIds)
    const allSlots = (slotsRes.data ?? []) as FacilitySlot[]
    primaryFacilitySlots = allSlots.filter(s => s.facility_id === primaryFacilityId)
    availableSlotKeys = Array.from(new Set(allSlots.map(s => s.key)))
  }

  return {
    requests: (requestsRes.data ?? []) as ShiftRequest[],
    submittedAt: submissionRes.data?.submitted_at ?? null,
    extendedUntil: submissionRes.data?.extended_until ?? null,
    primaryFacilitySlots,
    availableSlotKeys,
    deadlineDate: '2026-11-15',
  }
}

export async function saveAndSubmitRequests(
  entries: { date: string; type: RequestType; start_time?: string | null; end_time?: string | null }[],
): Promise<{ error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  // 当月分を全削除してから挿入（空欄になった日の削除漏れを防ぐ）
  const { error: delError } = await supabase
    .from('shift_requests')
    .delete()
    .eq('staff_id', user.id)
    .gte('date', '2026-12-01')
    .lte('date', '2026-12-31')
  if (delError) return { error: delError.message }

  if (entries.length > 0) {
    const rows = entries.map(e => ({
      staff_id: user.id,
      date: e.date,
      type: e.type,
      start_time: e.start_time ?? null,
      end_time: e.end_time ?? null,
    }))
    const { error } = await supabase.from('shift_requests').insert(rows)
    if (error) return { error: error.message }
  }

  const { error: submitError } = await supabase.rpc('submit_requests', { p_month: TARGET_MONTH })
  if (submitError) return { error: submitError.message }

  revalidatePath('/staff/requests')
  return {}
}
