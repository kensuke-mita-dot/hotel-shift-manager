'use server'

import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { redirect } from 'next/navigation'
import { loginIdToEmail, PIN_PATTERN } from '@/lib/staff-login'

export type AuthState = {
  error?: string
}

/**
 * ログイン
 * - スタッフ：ログインID＋6桁PIN（@ を含まない入力）
 * - 管理者：メールアドレス＋パスワード
 */
export async function loginAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const identifier = String(formData.get('identifier') ?? '').trim()
  const password   = String(formData.get('password')   ?? '')

  if (!identifier || !password) {
    return { error: 'ログインIDとPINを入力してください' }
  }

  const email = identifier.includes('@') ? identifier : loginIdToEmail(identifier)

  const supabase = createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const msg = SUPABASE_ERROR_MAP[error.message] ?? 'ログインに失敗しました'
    return { error: msg }
  }

  // ロール取得：RLSエラー時も安全にフォールバック
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ユーザー情報の取得に失敗しました' }

  let dest = '/staff/shifts' // デフォルト

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

/** スタッフのPIN変更（初回ログイン時・任意のタイミング） */
export async function changePinAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const pin     = String(formData.get('pin')     ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (!PIN_PATTERN.test(pin))  return { error: 'PINは6桁の数字で入力してください' }
  if (pin !== confirm)         return { error: '確認用のPINが一致しません' }
  if (/^(\d)\1{5}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) {
    return { error: '同じ数字の繰り返しや連番は使えません' }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.auth.updateUser({ password: pin })
  if (error) {
    if (/different from the old/i.test(error.message)) {
      return { error: '今のPINと違う番号にしてください' }
    }
    return { error: 'PINの変更に失敗しました' }
  }

  await createAdminClient()
    .from('profiles')
    .update({ must_change_pin: false })
    .eq('id', user.id)

  redirect('/staff/shifts?pin=changed')
}

/** ログアウト */
export async function logoutAction() {
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

const SUPABASE_ERROR_MAP: Record<string, string> = {
  'Invalid login credentials':
    'ログインIDまたはPINが正しくありません',
  'Email not confirmed':
    'メールアドレスが確認されていません。確認メールをご確認ください',
  'Too many requests':
    'ログイン試行回数が上限に達しました。しばらく時間をおいてお試しください',
}
