// Server Component — ヘッダー。未ログイン時は非表示
import { createClient } from '@/lib/supabase-server'
import { logoutAction } from '@/app/actions/auth'

export async function Navbar() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  // スタッフは所属施設名を表示
  let facilityLabel = '全施設'
  if (profile?.role === 'staff') {
    const { data: sf } = await supabase
      .from('staff_facilities')
      .select('facility_id')
      .eq('staff_id', user.id)
    if (sf && sf.length > 0) {
      facilityLabel = sf.map(r => r.facility_id).join('・')
    }
  }

  const userLabel = profile?.role === 'admin'
    ? `管理者 · ${facilityLabel}`
    : `${profile?.full_name ?? user.email ?? ''} · ${facilityLabel}`

  return (
    <header className="sticky top-0 z-30 h-14 bg-white border-b border-hs-border flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-bold text-hs-text tracking-wider whitespace-nowrap">HOTEL SHIFT</span>
        <span className="text-hs-border text-lg leading-none select-none">|</span>
        <span className="text-sm text-hs-text-sub truncate">{userLabel}</span>
      </div>

      <form action={logoutAction} className="flex-shrink-0 ml-3">
        <button
          type="submit"
          className="text-sm text-hs-text-light hover:text-hs-text px-2 py-1 rounded transition-colors min-h-tap"
        >
          ログアウト
        </button>
      </form>
    </header>
  )
}
