// src/app/api/shifts/ai-draft/route.ts
// ============================================================
// AI自動下書き生成エンドポイント（Gemini API連携想定）
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import type { AiDraftRequest, AiDraftResponse } from '@/types'

export async function POST(req: NextRequest) {
  const body: AiDraftRequest = await req.json()
  const { targetMonth, wishes, profiles } = body

  // ─────────────────────────────────────────────────────────
  // TODO: Gemini API 呼び出し
  //
  // const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  // const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })
  //
  // const prompt = buildShiftPrompt({ targetMonth, wishes, profiles })
  // const result = await model.generateContent(prompt)
  // const draft  = parseShiftDraft(result.response.text())
  // ─────────────────────────────────────────────────────────

  // プロンプト設計のガイドライン（実装時の参考）
  const PROMPT_TEMPLATE = `
あなたはホテルのシフト管理システムです。
以下のルールに従って${targetMonth}のシフト下書きをJSONで生成してください。

【ルール】
1. 各日の朝勤・夕勤・夜勤に最低1名を配置
2. 夜勤の翌日に同じスタッフを朝勤に入れない
3. スタッフの希望（wish）を最優先で考慮する
4. 週40時間を超えないよう配慮する

【スタッフ情報】
${JSON.stringify(profiles, null, 2)}

【希望一覧】
${JSON.stringify(wishes, null, 2)}

【出力形式（JSONのみ）】
{
  "shifts": [
    { "staff_id": "...", "shift_date": "YYYY-MM-DD", "slot": "morning|evening|night" }
  ],
  "warnings": ["..."]
}
`

  // MVP: スタブレスポンス（希望通りに割り当てるだけのロジック）
  const stubShifts = wishes
    .filter(w => w.wish !== 'off')
    .map(w => ({
      staff_id:     w.staff_id,
      shift_date:   w.wish_date,
      slot:         w.wish as 'morning' | 'evening' | 'night',
      is_confirmed: false,
      ai_suggested: true,
      ai_model:     'stub',
      ai_run_id:    null,
    }))

  const response: AiDraftResponse = {
    runId:    crypto.randomUUID(),
    shifts:   stubShifts,
    warnings: ['これはスタブ実装です。Gemini APIを接続してください。'],
  }

  return NextResponse.json(response)
}
