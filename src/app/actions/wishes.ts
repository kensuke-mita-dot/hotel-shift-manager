'use server'

import { createClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import type { WishType } from '@/types'

// ─── 指定月の希望一覧を取得 ──────────────────────────────────
export async function fetchWishes(
  staffId: string,
  year: number,
  month: number
): Promise<{ wishes: Record<string, WishType>; error?: string }> {
  const supabase = createClient()

  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('shift_wishes')
    .select('wish_date, wish')
    .eq('staff_id', staffId)
    .gte('wish_date', from)
    .lte('wish_date', to)

  if (error) return { wishes: {}, error: error.message }

  const wishes: Record<string, WishType> = {}
  for (const row of data ?? []) {
    wishes[row.wish_date] = row.wish as WishType
  }
  return { wishes }
}

// ─── 月の希望を一括保存（upsert） ────────────────────────────
export async function saveWishes(
  staffId: string,
  wishes: Record<string, WishType>
): Promise<{ error?: string }> {
  const supabase = createClient()

  const rows = Object.entries(wishes).map(([wish_date, wish]) => ({
    staff_id: staffId,
    wish_date,
    wish,
  }))

  if (rows.length === 0) return {}

  const { error } = await supabase
    .from('shift_wishes')
    .upsert(rows, { onConflict: 'staff_id,wish_date' })

  if (error) return { error: error.message }

  revalidatePath('/staff/wishes')
  return {}
}
