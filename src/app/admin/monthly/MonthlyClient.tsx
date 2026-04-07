'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { MonthlyMatrix } from '@/components/admin/MonthlyMatrix'
import { fetchMonthData } from '@/app/actions/shifts'
import type { DayAssignment } from '@/types'

interface Props {
  initialYear:        number
  initialMonth:       number
  initialAssignments: DayAssignment[]
}

export function MonthlyClient({ initialYear, initialMonth, initialAssignments }: Props) {
  const router = useRouter()
  const [year,        setYear]        = useState(initialYear)
  const [month,       setMonth]       = useState(initialMonth)
  const [assignments, setAssignments] = useState(initialAssignments)
  const [isPending,   startTransition] = useTransition()

  const changeMonth = (dir: 1 | -1) => {
    const newMonth = month + dir
    const newYear  = newMonth < 1 ? year - 1 : newMonth > 12 ? year + 1 : year
    const adjMonth = newMonth < 1 ? 12 : newMonth > 12 ? 1 : newMonth

    setYear(newYear)
    setMonth(adjMonth)
    setAssignments([])

    startTransition(async () => {
      const result = await fetchMonthData(newYear, adjMonth)
      if (result.error) {
        toast.error(`データ取得エラー: ${result.error}`)
        return
      }
      setAssignments(result.assignments)
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">月次シフトマトリックス</h1>
            <p className="text-sm text-gray-500 mt-0.5">月全体のシフト状況を確認。セルをクリックして日次調整へ</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => changeMonth(-1)} disabled={isPending}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-base font-medium min-w-[110px] text-center flex items-center justify-center gap-1.5">
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
              {year}年{month}月
            </span>
            <Button variant="outline" size="icon" onClick={() => changeMonth(1)} disabled={isPending}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          {isPending ? (
            <div className="flex items-center justify-center h-48 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">読み込み中...</span>
            </div>
          ) : (
            <MonthlyMatrix
              year={year}
              month={month}
              assignments={assignments}
              onSelectDay={(date) => router.push(`/admin/daily?date=${date}`)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
