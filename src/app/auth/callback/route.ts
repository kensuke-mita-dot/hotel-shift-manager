import { createClient } from '@/lib/supabase-server'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin))
  }

  const supabase = createClient()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    console.error('[callback] exchangeCodeForSession error:', exchangeError.message)
    return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin))
  }

  // セッション確立後にユーザー情報を取得
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin))
  }

  // profiles から role と is_active を取得
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  // 停止済みアカウントはログアウトしてエラー表示
  if (!profile?.is_active) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=inactive', origin))
  }

  // 役割に応じてリダイレクト
  const dest = profile?.role === 'admin' ? '/admin/daily' : '/staff/requests'
  return NextResponse.redirect(new URL(dest, origin))
}
