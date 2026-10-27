'use server'

import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export type AuthState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'error'; message: string }
  | { status: 'verified' }

/** リクエストの origin を取得（プレビューURLでも正しく動く） */
async function getOrigin(): Promise<string> {
  const headersList = await headers()
  // x-forwarded-host が優先（Vercel プレビューなど）
  const host = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost:3000'
  const proto = headersList.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

/** メールリンク（OTP）を送信する */
export async function loginAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = (formData.get('email') as string | null)?.trim() ?? ''

  if (!email) {
    return { status: 'error', message: 'メールアドレスを入力してください' }
  }

  // 招待済みアカウントのみ許可（新規登録は admin からの招待のみ）
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (!profile) {
    return {
      status: 'error',
      message: 'このメールアドレスは登録されていません。管理者にお問い合わせください。',
    }
  }

  const emailRedirectTo = `${await getOrigin()}/auth/callback`

  const supabase = createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo,
    },
  })

  if (error) {
    console.error('[loginAction] OTP error:', error.message)
    return { status: 'error', message: 'メールの送信に失敗しました。しばらくしてから再度お試しください。' }
  }

  return { status: 'sent', email }
}

/** 6桁コードでログインを確認する */
export async function verifyOtpAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = (formData.get('email') as string | null)?.trim() ?? ''
  const token = (formData.get('token') as string | null)?.replace(/\s/g, '') ?? ''

  if (!token || token.length !== 6) {
    return { status: 'error', message: '6桁のコードを入力してください' }
  }

  const supabase = createClient()
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })

  if (error) {
    console.error('[verifyOtpAction] verify error:', error.message)
    return { status: 'error', message: 'コードが正しくないか、有効期限が切れています' }
  }

  redirect('/staff/requests')
}

/** ログアウト */
export async function logoutAction() {
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
