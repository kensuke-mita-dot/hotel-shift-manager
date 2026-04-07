import { format } from 'date-fns'
import { fetchDayData } from '@/app/actions/shifts'
import { DailyAdjustClient } from './DailyAdjustClient'

export default async function DailyAdjustPage({
  searchParams,
}: {
  searchParams: { date?: string }
}) {
  const today   = format(new Date(), 'yyyy-MM-dd')
  const dateStr = searchParams.date ?? today

  const { pool, assignment, error } = await fetchDayData(dateStr)

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
    <DailyAdjustClient
      initialDate={dateStr}
      initialPool={pool}
      initialAssignment={assignment}
    />
  )
}
