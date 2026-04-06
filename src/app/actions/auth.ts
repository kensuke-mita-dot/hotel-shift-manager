'use server'

import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export type AuthState = {
  error?: string
}

/** メール/パスワードでログイン */
export async function loginAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email    = formData.get('email')    as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'メールアドレスとパスワードを入力してください' }
  }

  const supabase = createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Supabase のエラーメッセージを日本語に変換
    const msg = SUPABASE_ERROR_MAP[error.message] ?? 'ログインに失敗しました'
    return { error: msg }
  }

  // ロールを取得して遷移先を決定
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ユーザー情報の取得に失敗しました' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const dest = profile?.role === 'admin' ? '/admin/daily' : '/staff/wishes'
  redirect(dest)
}

/** ログアウト */
export async function logoutAction() {
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

const SUPABASE_ERROR_MAP: Record<string, string> = {
  'Invalid login credentials':
    'メールアドレスまたはパスワードが正しくありません',
  'Email not confirmed':
    'メールアドレスが確認されていません。確認メールをご確認ください',
  'Too many requests':
    'ログイン試行回数が上限に達しました。しばらく時間をおいてお試しください',
}
