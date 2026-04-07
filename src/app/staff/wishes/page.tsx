import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { fetchWishes } from '@/app/actions/wishes'
import { WishInputGrid } from '@/components/staff/WishInputGrid'
import type { WishType } from '@/types'

export default async function WishesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // 来月を対象月にする
  const now   = new Date()
  const year  = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
  const month = now.getMonth() === 11 ? 1 : now.getMonth() + 2

  if (!user) {
    redirect('/login')
  }

  const { wishes, error } = await fetchWishes(user.id, year, month)

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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">シフト希望入力</h1>
          <p className="text-sm text-gray-500 mt-0.5">来月のシフト希望を入力してください</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <WishInputGrid
            year={year}
            month={month}
            staffId={user.id}
            initialWishes={wishes as Record<string, WishType>}
          />
        </div>
      </div>
    </div>
  )
}
