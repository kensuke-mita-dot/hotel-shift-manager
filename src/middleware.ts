// src/middleware.ts
// 認証チェック + ロール別ルーティング
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { UserRole } from '@/types'

export async function middleware(request: NextRequest) {
  // Supabase env が未設定ならスルー（ビルド・CI 環境向け）
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

  // ── セッション更新（必須：トークンリフレッシュ） ──────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // ── パブリックルート ─────────────────────────────────────────────
  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/auth')

  if (isPublic) {
    if (user) {
      // ログイン済みならロールに応じてリダイレクト
      const role = await getRole(supabase, user.id)
      const dest = role === 'admin' ? '/admin/daily' : '/staff/wishes'
      return NextResponse.redirect(new URL(dest, request.url))
    }
    return supabaseResponse
  }

  // ── API ルートはミドルウェアをスキップ ──────────────────────────
  if (pathname.startsWith('/api')) {
    return supabaseResponse
  }

  // ── 未認証 → ログインページへ ────────────────────────────────────
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ── 管理者ルートのロールチェック ─────────────────────────────────
  if (pathname.startsWith('/admin')) {
    const role = await getRole(supabase, user.id)
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/staff/wishes', request.url))
    }
  }

  return supabaseResponse
}

// プロフィールからロールを取得（管理者チェック時のみ呼ばれる）
async function getRole(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
): Promise<UserRole | null> {
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  return data?.role ?? null
}

export const config = {
  matcher: [
    // 静的ファイル・_next を除く全ルート
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
