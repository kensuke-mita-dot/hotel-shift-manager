import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchStaffList } from '@/app/actions/staff'
import { StaffClient } from './StaffClient'
import type { Facility } from '@/types'

export default async function StaffPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [staffResult, { data: facilitiesData, error: fErr }] = await Promise.all([
    fetchStaffList(),
    admin.from('facilities').select('id, name, sort').order('sort'),
  ])

  if (staffResult.error || fErr) {
    const msg = staffResult.error ?? fErr?.message ?? '不明なエラー'
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white border border-red-200 rounded-xl p-6 text-red-700 text-sm max-w-md">
          <p className="font-medium mb-1">データ取得エラー</p>
          <p>{msg}</p>
        </div>
      </div>
    )
  }

  return (
    <StaffClient
      initialStaff={staffResult.staff}
      currentUserId={user.id}
      facilities={(facilitiesData ?? []) as Facility[]}
    />
  )
}
