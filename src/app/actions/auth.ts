'use server'

import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export type AuthState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'error'; message: string }

/** メールリンク（OTP）を送信する */
export async function loginAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = (formData.get('email') as string | null)?.trim() ?? ''

  if (!email) {
    return { status: 'error', message: 'メールアドレスを入力してください' }
  }

  const headersList = await headers()
  const host   = headersList.get('host') ?? ''
  const proto  = process.env.APP_URL?.startsWith('https') ? 'https' : 'http'
  const origin = process.env.APP_URL ?? `${proto}://${host}`
  const emailRedirectTo = `${origin}/auth/callback`

  const supabase = createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo,
    },
  })

  if (error) {
    // 登録されていないメールアドレスでも同じ表示にする（登録の有無を知られないため）
    console.error('[loginAction] OTP error:', error.message)
  }

  // 成功・失敗どちらも「送信しました」を返す
  return { status: 'sent', email }
}

/** ログアウト */
export async function logoutAction() {
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
