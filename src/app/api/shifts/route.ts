// src/app/api/shifts/route.ts
// シフトCRUD（Phase 2でSupabase実装）
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')

  // TODO: Supabase からシフト取得
  // const supabase = createServerClient(...)
  // const { data } = await supabase.from('shifts').select('*').eq('shift_date', date)

  return NextResponse.json({ shifts: [], date })
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  // TODO: Supabase にシフト保存
  // const supabase = createServerClient(...)
  // const { data, error } = await supabase.from('shifts').upsert(body.shifts)

  return NextResponse.json({ ok: true })
}
