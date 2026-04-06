// src/components/layout/Navbar.tsx
// 認証済みユーザー向けナビゲーションバー（Server Component）
import { createClient } from '@/lib/supabase-server'
import { logoutAction } from '@/app/actions/auth'
import { Hotel, LogOut } from 'lucide-react'
import Link from 'next/link'
import type { UserRole } from '@/types'

const ROLE_LABEL: Record<UserRole, string> = {
  admin: '管理者',
  staff: 'スタッフ',
}

const ROLE_BADGE_CLASS: Record<UserRole, string> = {
  admin: 'bg-gray-900 text-white',
  staff: 'bg-blue-100 text-blue-800',
}

const ADMIN_LINKS = [
  { href: '/admin/daily',   label: '日次調整' },
  { href: '/admin/monthly', label: '月次一覧' },
]

const STAFF_LINKS = [
  { href: '/staff/wishes', label: '希望入力' },
]

export async function Navbar() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  const role     = (profile?.role ?? 'staff') as UserRole
  const fullName = profile?.full_name ?? user.email ?? 'ユーザー'
  const navLinks = role === 'admin' ? ADMIN_LINKS : STAFF_LINKS

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">

        {/* ロゴ */}
        <Link
          href={role === 'admin' ? '/admin/daily' : '/staff/wishes'}
          className="flex items-center gap-2 flex-shrink-0"
        >
          <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center">
            <Hotel className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-900 hidden sm:block">
            シフト管理
          </span>
        </Link>

        {/* ナビリンク */}
        <nav className="flex items-center gap-1 flex-1">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-1.5 rounded-md text-sm text-gray-600
                hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* ユーザー情報 + ログアウト */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-sm text-gray-700">{fullName}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE_CLASS[role]}`}
            >
              {ROLE_LABEL[role]}
            </span>
          </div>

          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm
                text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              title="ログアウト"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block">ログアウト</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
