// src/lib/auth-guard.ts
// Server Action 用の権限チェック。
// Server Action は middleware を通らないため、service role（RLSバイパス）を使う処理や
// 管理者専用の処理は必ずここで確認する。
import { createClient } from '@/lib/supabase-server'

export async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ログインが必要です' }

  const { data: ok, error } = await supabase.rpc('is_admin')
  if (error || ok !== true) return { error: '管理者のみ実行できます' }

  return { userId: user.id }
}
