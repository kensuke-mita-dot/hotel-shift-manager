'use client'

import { WishInputGrid } from '@/components/staff/WishInputGrid'

export default function WishesPage() {
  const now = new Date()

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">シフト希望入力</h1>
          <p className="text-sm text-gray-500 mt-0.5">来月のシフト希望を入力してください</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {/* TODO: 認証実装後にstaffIdをセッションから取得 */}
          <WishInputGrid
            year={now.getFullYear()}
            month={now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2}
            staffId="placeholder-staff-id"
          />
        </div>
      </div>
    </div>
  )
}
