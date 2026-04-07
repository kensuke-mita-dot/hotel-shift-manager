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
    const msg = SUPABASE_ERROR_MAP[error.message] ?? 'ログインに失敗しました'
    return { error: msg }
  }

  // ロール取得：RLSエラー時も安全にフォールバック
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ユーザー情報の取得に失敗しました' }

  let dest = '/staff/wishes' // デフォルト

  try {
    // get_my_role() 関数を経由（RLS再帰を回避）
    const { data: roleRow } = await supabase
      .rpc('get_my_role')

    if (roleRow === 'admin') {
      dest = '/admin/daily'
    }
  } catch {
    // フォールバック：profiles テーブルを直接参照
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role === 'admin') {
      dest = '/admin/daily'
    }
  }

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
