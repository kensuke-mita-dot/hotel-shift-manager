// src/app/api/wishes/route.ts
// 希望シフトCRUD（Phase 2でSupabase実装）
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const staffId = searchParams.get('staffId')
  const month = searchParams.get('month') // 'YYYY-MM'

  // TODO: Supabase から希望取得
  // const supabase = createServerClient(...)
  // const { data } = await supabase.from('shift_wishes')
  //   .select('*').eq('staff_id', staffId).like('wish_date', `${month}%`)

  return NextResponse.json({ wishes: [], staffId, month })
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  // TODO: Supabase に希望を upsert
  // const supabase = createServerClient(...)
  // const { data, error } = await supabase.from('shift_wishes')
  //   .upsert(body.wishes, { onConflict: 'staff_id,wish_date' })

  return NextResponse.json({ ok: true })
}
