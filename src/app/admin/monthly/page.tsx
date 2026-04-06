'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MonthlyMatrix } from '@/components/admin/MonthlyMatrix'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { DayAssignment } from '@/types'

// サンプルデータ（実装時はSupabaseから取得）
const SAMPLE_ASSIGNMENTS: DayAssignment[] = []

export default function MonthlyPage() {
  const router = useRouter()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">月次シフトマトリックス</h1>
            <p className="text-sm text-gray-500 mt-0.5">月全体のシフト状況を確認</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prevMonth}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-base font-medium min-w-[100px] text-center">
              {year}年{month}月
            </span>
            <Button variant="outline" size="icon" onClick={nextMonth}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <MonthlyMatrix
            year={year}
            month={month}
            assignments={SAMPLE_ASSIGNMENTS}
            onSelectDay={(date) => router.push(`/admin/daily?date=${date}`)}
          />
        </div>
      </div>
    </div>
  )
}
