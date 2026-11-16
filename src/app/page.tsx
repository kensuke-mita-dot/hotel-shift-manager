import { redirect } from 'next/navigation'
import { getMyProfile } from '@/lib/session'

export default async function Home() {
  // Supabase が未設定（ビルド時など）はそのまま admin/daily へ
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) redirect('/admin/daily')

  const profile = await getMyProfile()
  if (!profile) redirect('/login')
  redirect(profile.role === 'admin' ? '/admin/daily' : '/staff/schedule')
}
