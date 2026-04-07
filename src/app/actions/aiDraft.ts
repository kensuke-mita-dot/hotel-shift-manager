'use server'

import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import type { ShiftSlot, WishType } from '@/types'

interface DraftShift {
  staff_id:   string
  shift_date: string
  slot:       ShiftSlot
}

interface GenerateResult {
  generated: number
  warnings:  string[]
  error?:    string
}

// ─── AIドラフト生成メイン ────────────────────────────────────
export async function generateDraft(
  year: number,
  month: number,
): Promise<GenerateResult> {
  const supabase = createClient()
  const admin    = createAdminClient()

  const pad  = (n: number) => String(n).padStart(2, '0')
  const from = `${year}-${pad(month)}-01`
  const to   = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`

  // ── データ取得 ─────────────────────────────────────────────
  const [profilesRes, wishesRes, { data: { user } }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('role', 'staff'),
    supabase.from('shift_wishes').select('staff_id, wish_date, wish').gte('wish_date', from).lte('wish_date', to),
    supabase.auth.getUser(),
  ])

  if (profilesRes.error) return { generated: 0, warnings: [], error: profilesRes.error.message }

  const profiles = profilesRes.data ?? []
  const wishes   = wishesRes.data   ?? []

  if (profiles.length === 0) return { generated: 0, warnings: ['スタッフが登録されていません'] }

  // ── シフト生成 ─────────────────────────────────────────────
  const shifts = process.env.ANTHROPIC_API_KEY
    ? await generateWithClaude(year, month, profiles, wishes)
    : generateWithStub(year, month, profiles, wishes)

  if ('error' in shifts) return { generated: 0, warnings: [], error: shifts.error }

  // ── DBに保存（当月全削除→挿入） ──────────────────────────
  const { error: delErr } = await admin
    .from('shifts')
    .delete()
    .gte('shift_date', from)
    .lte('shift_date', to)

  if (delErr) return { generated: 0, warnings: [], error: delErr.message }

  if (shifts.rows.length > 0) {
    const rows = shifts.rows.map(s => ({
      ...s,
      is_confirmed: false,
      ai_suggested: true,
      ai_model:     process.env.ANTHROPIC_API_KEY ? 'claude-haiku-4-5' : 'stub',
    }))
    const { error: insErr } = await admin.from('shifts').insert(rows)
    if (insErr) return { generated: 0, warnings: [], error: insErr.message }
  }

  // ── ai_draft_runs に記録 ──────────────────────────────────
  if (user) {
    await admin.from('ai_draft_runs').insert({
      triggered_by: user.id,
      target_month: from,
      model_name:   process.env.ANTHROPIC_API_KEY ? 'claude-haiku-4-5' : 'stub',
      status:       'done',
      finished_at:  new Date().toISOString(),
    })
  }

  return { generated: shifts.rows.length, warnings: shifts.warnings }
}

// ─── スタブロジック（APIキーなし） ───────────────────────────
function generateWithStub(
  year: number, month: number,
  profiles: { id: string; full_name: string }[],
  wishes:   { staff_id: string; wish_date: string; wish: string }[],
): { rows: DraftShift[]; warnings: string[] } {
  const pad  = (n: number) => String(n).padStart(2, '0')
  const days = Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) =>
    `${year}-${pad(month)}-${pad(i + 1)}`
  )

  // 希望マップ: date → staffId → wish
  const wishMap = new Map<string, Map<string, WishType>>()
  for (const w of wishes) {
    if (!wishMap.has(w.wish_date)) wishMap.set(w.wish_date, new Map())
    wishMap.get(w.wish_date)!.set(w.staff_id, w.wish as WishType)
  }

  const rows: DraftShift[]  = []
  const warnings: string[]  = []
  const staffIds = profiles.map(p => p.id)
  // 前日夜勤スタッフ（夜勤明け朝勤NG）
  let prevNightIds = new Set<string>()

  for (const date of days) {
    const dayWish = wishMap.get(date) ?? new Map<string, WishType>()
    const slots: ShiftSlot[] = ['morning', 'evening', 'night']
    const assignedToday = new Set<string>()

    for (const slot of slots) {
      // 1. その日のslotを希望している人
      const preferred = staffIds.filter(id =>
        dayWish.get(id) === slot &&
        !assignedToday.has(id) &&
        !(slot === 'morning' && prevNightIds.has(id))
      )

      // 2. 希望者がいない場合は未配置のスタッフから補填
      const fallback = staffIds.filter(id =>
        !assignedToday.has(id) &&
        dayWish.get(id) !== 'off' &&
        !(slot === 'morning' && prevNightIds.has(id))
      )

      // 3. それでもいなければ'off'以外を探す（最終手段）
      const lastResort = staffIds.filter(id =>
        !assignedToday.has(id) &&
        !(slot === 'morning' && prevNightIds.has(id))
      )

      const candidates = preferred.length > 0 ? preferred
        : fallback.length  > 0 ? fallback
        : lastResort

      if (candidates.length === 0) {
        warnings.push(`${date} ${slot}: 配置できるスタッフがいません`)
        continue
      }

      // 日付をシードにして決定的に選択（毎回同じ結果）
      const idx = (date.replace(/-/g, '').slice(-2).charCodeAt(0) + slots.indexOf(slot)) % candidates.length
      const picked = candidates[idx]
      rows.push({ staff_id: picked, shift_date: date, slot })
      assignedToday.add(picked)
    }

    // 翌日のNG判定用：当日夜勤
    prevNightIds = new Set(
      rows.filter(r => r.shift_date === date && r.slot === 'night').map(r => r.staff_id)
    )
  }

  return { rows, warnings }
}

// ─── Claude API（APIキーあり） ────────────────────────────────
async function generateWithClaude(
  year: number, month: number,
  profiles: { id: string; full_name: string }[],
  wishes:   { staff_id: string; wish_date: string; wish: string }[],
): Promise<{ rows: DraftShift[]; warnings: string[] } | { error: string }> {
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client    = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const pad      = (n: number) => String(n).padStart(2, '0')
    const lastDay  = new Date(year, month, 0).getDate()
    const nameMap  = new Map(profiles.map(p => [p.id, p.full_name]))

    const prompt = `あなたはホテルのシフト管理AIです。
以下のルールと希望データに基づき、${year}年${month}月（1日〜${lastDay}日）のシフト案をJSONで生成してください。

【絶対ルール】
1. 各日の朝勤・夕勤・夜勤に必ず1名以上配置する
2. 夜勤の翌日に同じスタッフを朝勤に入れない
3. 1人のスタッフを同じ日に複数スロットに入れない

【優先ルール】
4. スタッフの希望（wish）を最優先で考慮する
5. "off"希望のスタッフはなるべく休ませる
6. 週あたりの勤務が偏らないようにする

【スタッフ一覧】
${profiles.map(p => `- ${p.id}: ${p.full_name}`).join('\n')}

【希望一覧（staff_id, 日付, 希望）】
${wishes.map(w => `- ${nameMap.get(w.staff_id) ?? w.staff_id}: ${w.wish_date} ${w.wish}`).join('\n')}

【出力形式（JSONのみ・説明文不要）】
{
  "shifts": [
    { "staff_id": "...", "shift_date": "YYYY-MM-DD", "slot": "morning|evening|night" }
  ],
  "warnings": ["..."]
}`

    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages:   [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const json = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim())

    const rows: DraftShift[] = (json.shifts ?? []).map((s: any) => ({
      staff_id:   s.staff_id,
      shift_date: s.shift_date,
      slot:       s.slot as ShiftSlot,
    }))

    return { rows, warnings: json.warnings ?? [] }
  } catch (e: any) {
    return { error: `Claude API エラー: ${e.message}` }
  }
}
