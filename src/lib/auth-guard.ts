// src/lib/auth-guard.ts
// Server Action 用の権限チェック。
// Server Action は middleware を通らないため、service role（RLSバイパス）を使う処理や
// 管理者専用の処理は必ずここで確認する。
// 判定はDB関数 is_admin() と同じ（role = 'admin' かつ 有効なアカウント）。
import { getMyProfile } from '@/lib/session'

export async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const profile = await getMyProfile()
  if (!profile) return { error: 'ログインが必要です' }
  if (profile.role !== 'admin' || !profile.is_active) return { error: '管理者のみ実行できます' }
  return { userId: profile.id }
}
