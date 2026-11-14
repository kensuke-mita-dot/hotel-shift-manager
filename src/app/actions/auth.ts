'use server'

import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { loginIdToEmail, PIN_PATTERN } from '@/lib/staff-login'

export type AuthState = { error?: string }

/**
 * ログイン
 * - スタッフ：ログインID＋6桁PIN（@ を含まない入力）
 * - 管理者：メールアドレス＋パスワード
 */
export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const identifier = String(formData.get('identifier') ?? '').trim()
  const password   = String(formData.get('password')   ?? '')

  if (!identifier || !password) return { error: 'ログインIDとPINを入力してください' }

  const email = identifier.includes('@') ? identifier : loginIdToEmail(identifier)

  const supabase = createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    if (/too many/i.test(error.message)) {
      return { error: 'ログインの試行回数が上限に達しました。しばらく時間をおいてお試しください' }
    }
    return { error: 'ログインIDまたはPINが正しくありません' }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ログインに失敗しました' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  if (!profile?.is_active) {
    await supabase.auth.signOut()
    return { error: 'このアカウントは停止されています。管理者にお問い合わせください' }
  }

  redirect(profile.role === 'admin' ? '/admin/daily' : '/staff/schedule')
}

/** スタッフのPIN変更（初回ログイン時・任意のタイミング） */
export async function changePinAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const pin     = String(formData.get('pin')     ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (!PIN_PATTERN.test(pin)) return { error: 'PINは6桁の数字で入力してください' }
  if (pin !== confirm)        return { error: '確認用のPINが一致しません' }
  if (/^(\d)\1{5}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) {
    return { error: '同じ数字の繰り返しや連番は使えません' }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.auth.updateUser({ password: pin })
  if (error) {
    if (/different from the old/i.test(error.message)) return { error: '今のPINと違う番号にしてください' }
    return { error: 'PINの変更に失敗しました' }
  }

  await createAdminClient().from('profiles').update({ must_change_pin: false }).eq('id', user.id)

  redirect('/staff/schedule?pin=changed')
}

/** 管理者のパスワード変更（ログイン中・再設定メールから戻ってきたとき） */
export async function changePasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get('password') ?? '')
  const confirm  = String(formData.get('confirm')  ?? '')

  if (password.length < 10)  return { error: 'パスワードは10文字以上にしてください' }
  if (password !== confirm)  return { error: '確認用のパスワードが一致しません' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    if (/different from the old/i.test(error.message)) return { error: '今のパスワードと違うものにしてください' }
    if (/weak|pwned|leaked/i.test(error.message))      return { error: 'このパスワードは使えません。より推測されにくいものにしてください' }
    if (/reauthentication|nonce/i.test(error.message)) return { error: 'セキュリティのため、一度ログアウトしてログインし直してから変更してください' }
    return { error: 'パスワードの変更に失敗しました' }
  }

  redirect('/account/password?changed=1')
}

/** 管理者のパスワード再設定メールを送る（スタッフのPINは管理者が再発行） */
export async function sendPasswordResetAction(_prev: AuthState & { sent?: boolean }, formData: FormData): Promise<AuthState & { sent?: boolean }> {
  const email = String(formData.get('email') ?? '').trim()
  if (!email) return { error: 'メールアドレスを入力してください' }
  if (!email.includes('@')) {
    return { error: 'スタッフの方は、管理者にPINの再発行を依頼してください' }
  }

  const h = headers()
  const host  = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${proto}://${host}`

  const supabase = createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/account/password`,
  })
  if (error && /rate limit|too many/i.test(error.message)) {
    return { error: '送信回数の上限に達しました。1時間ほど時間をおいてお試しください' }
  }
  // 登録の有無が分からないよう、成功・失敗に関わらず同じ表示にする
  return { sent: true }
}

/** ログアウト */
export async function logoutAction() {
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
