// src/lib/staff-schedule.ts
// スタッフの「確定シフト → 施設」タブ用の読み込み（サーバー側だけで使う）。
// 同僚の名前や MAHB のシフトは RLS では読めないので、service role で読む。
// そのかわり、読める施設は「本人の所属施設 ＋ MAHB（社員が滞在することがあるため全員に公開）」に限る。
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { monthRange, facilityRank } from '@/lib/utils'
import { isWorkKind } from '@/lib/shift-kinds'
import type { FacilitySlot } from '@/types'

/** 全スタッフに見せる施設 */
export const SHARED_FACILITY = 'MAHB'

export interface TeamShift {
  staffId: string
  name: string
  kind: string
  start: string
  end: string
}

export interface TeamSchedule {
  /** 見られる施設（並び順どおり） */
  facilities: { id: string; name: string }[]
  facilityId: string | null
  slots: FacilitySlot[]
  /** 日付 → その日の勤務（休み・有給は出さない） */
  byDate: Map<string, TeamShift[]>
  error?: string
}

/** 本人が見られる施設の一覧（所属施設 ＋ MAHB） */
export async function viewableFacilities(userId: string): Promise<{ id: string; name: string }[]> {
  const supabase = createClient()
  const [{ data: sf }, { data: fs }] = await Promise.all([
    supabase.from('staff_facilities').select('facility_id, is_primary').eq('staff_id', userId),
    supabase.from('facilities').select('id, name'),
  ])
  const mine = (sf ?? []).sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map(r => r.facility_id as string)
  const ids = Array.from(new Set([...mine, SHARED_FACILITY]))
  const name = new Map((fs ?? []).map(f => [f.id as string, f.name as string]))
  // 主な所属を先頭に、残りは施設の並び順
  const [first, ...rest] = ids
  return [first, ...rest.sort((a, b) => facilityRank(a) - facilityRank(b))]
    .filter(Boolean)
    .map(id => ({ id, name: name.get(id) ?? id }))
}

export async function loadTeamSchedule(userId: string, month: string, requested: string | undefined): Promise<TeamSchedule> {
  const facilities = await viewableFacilities(userId)
  const facilityId = facilities.find(f => f.id === requested)?.id ?? facilities[0]?.id ?? null
  const empty: TeamSchedule = { facilities, facilityId, slots: [], byDate: new Map() }
  if (!facilityId) return empty

  const { from, to } = monthRange(month)
  const db = createAdminClient()
  const [shRes, slRes] = await Promise.all([
    db.from('published_shifts')
      .select('staff_id, date, kind, start_time, end_time')
      .eq('facility_id', facilityId).gte('date', from).lte('date', to)
      .order('date').order('start_time'),
    db.from('facility_slots').select('*').eq('facility_id', facilityId).order('sort'),
  ])
  if (shRes.error) return { ...empty, error: shRes.error.message }

  const work = (shRes.data ?? []).filter(s => isWorkKind(s.kind))
  const ids = Array.from(new Set(work.map(s => s.staff_id as string)))
  const { data: profiles } = ids.length
    ? await db.from('profiles').select('id, full_name').in('id', ids)
    : { data: [] as { id: string; full_name: string }[] }
  const nameOf = new Map((profiles ?? []).map(p => [p.id, p.full_name]))

  const byDate = new Map<string, TeamShift[]>()
  for (const s of work) {
    const list = byDate.get(s.date) ?? []
    list.push({
      staffId: s.staff_id, name: nameOf.get(s.staff_id) ?? '—',
      kind: s.kind, start: s.start_time, end: s.end_time,
    })
    byDate.set(s.date, list)
  }
  return { facilities, facilityId, slots: (slRes.data ?? []) as FacilitySlot[], byDate }
}
