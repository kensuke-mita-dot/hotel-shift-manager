import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { fetchStaff } from '@/app/actions/staff'
import { StaffClient } from './StaffClient'

export default async function StaffPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { staff, error } = await fetchStaff()

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white border border-red-200 rounded-xl p-6 text-red-700 text-sm max-w-md">
          <p className="font-medium mb-1">データ取得エラー</p>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return <StaffClient initialStaff={staff} currentUserId={user.id} />
}
