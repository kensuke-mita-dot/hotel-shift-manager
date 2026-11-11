// src/lib/auth-guard.ts
// Server Action 用の権限チェック。
// Server Action は middleware をスキップするため、
// service role（RLSバイパス）を使う処理は必ずここで管理者か確認する。
import { createClient } from '@/lib/supabase-server'

export async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ログインが必要です' }

  const { data: role, error } = await supabase.rpc('get_my_role')
  if (error || role !== 'admin') return { error: '管理者のみ実行できます' }

  return { userId: user.id }
}
