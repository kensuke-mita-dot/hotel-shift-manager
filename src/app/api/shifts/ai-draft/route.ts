// Phase 2 まで「近日公開」のスタブ
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'AI下書き機能は Phase 2 で公開予定です。' },
    { status: 503 },
  )
}
