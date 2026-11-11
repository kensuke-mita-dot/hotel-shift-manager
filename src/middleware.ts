// src/middleware.ts
// 認証チェック + ロール別ルーティング + 停止ユーザーのログアウト
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { UserRole } from '@/types'

export async function middleware(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // セッション更新（トークンリフレッシュのために必須）
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // ── パブリックルート ──────────────────────────────────────────────
  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/auth')

  if (isPublic) {
    if (user) {
      const dest = await getDestination(supabase, user.id)
      if (dest === 'inactive') {
        // 停止済みアカウント：ログアウトしてエラー表示
        await supabase.auth.signOut()
        return NextResponse.redirect(new URL('/login?error=inactive', request.url))
      }
      return NextResponse.redirect(new URL(dest, request.url))
    }
    return supabaseResponse
  }

  // ── API / Server Action はスキップ ───────────────────────────────
  if (pathname.startsWith('/api') || request.headers.has('next-action')) {
    return supabaseResponse
  }

  // ── 未認証 → ログインページへ ────────────────────────────────────
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ── 停止ユーザーのチェック ────────────────────────────────────────
  const dest = await getDestination(supabase, user.id)
  if (dest === 'inactive') {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=inactive', request.url))
  }

  // ── 管理者ルートのロールチェック ─────────────────────────────────
  if (pathname.startsWith('/admin') && dest !== '/admin/daily') {
    return NextResponse.redirect(new URL('/staff/schedule', request.url))
  }

  // ── 初期PIN・再発行PINのままならPIN変更を先に求める ───────────────
  // （管理者がスタッフ画面を確認用に開くのは許可）
  if (pathname.startsWith('/staff') && pathname !== '/staff/pin' && dest !== '/admin/daily') {
    const { data } = await supabase
      .from('profiles')
      .select('must_change_pin')
      .eq('id', user.id)
      .single()
    if (data?.must_change_pin) {
      return NextResponse.redirect(new URL('/staff/pin', request.url))
    }
  }

  return supabaseResponse
}

async function getDestination(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
): Promise<'/admin/daily' | '/staff/schedule' | 'inactive'> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', userId)
    .single()

  if (!profile?.is_active) return 'inactive'
  return profile?.role === 'admin' ? '/admin/daily' : '/staff/schedule'
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
