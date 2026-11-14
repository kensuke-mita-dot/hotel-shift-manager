import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { CheckCircle2 } from 'lucide-react'
import { PasswordForm } from './PasswordForm'

export default async function PasswordPage({
  searchParams,
}: {
  searchParams: { changed?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('login_id, role')
    .eq('id', user.id)
    .single()

  // スタッフ（ログインID＋PIN）はPIN変更画面へ
  if (profile?.login_id) redirect('/staff/pin')

  return (
    <div className="p-4">
      <div className="max-w-sm mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-hs-text">パスワードの変更</h1>
          <p className="text-sm text-hs-text-sub mt-1">管理者ログイン（{user.email}）のパスワードを変更します。</p>
        </div>
        {searchParams.changed ? (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-btn px-3 py-3 text-sm text-green-800">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            パスワードを変更しました。次回から新しいパスワードでログインしてください。
          </div>
        ) : (
          <div className="bg-white rounded-card border border-hs-border p-6">
            <PasswordForm />
          </div>
        )}
        {profile?.role === 'admin' && (
          <p className="text-center text-sm mt-4">
            <Link href="/admin/daily" className="text-hs-text-sub underline">管理画面に戻る</Link>
          </p>
        )}
      </div>
    </div>
  )
}
