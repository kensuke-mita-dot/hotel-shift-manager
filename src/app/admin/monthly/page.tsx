import { fetchMonthData } from '@/app/actions/shifts'
import { MonthlyClient } from './MonthlyClient'

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string }
}) {
  const now   = new Date()
  const year  = searchParams.year  ? parseInt(searchParams.year)  : now.getFullYear()
  const month = searchParams.month ? parseInt(searchParams.month) : now.getMonth() + 1

  const { assignments, error } = await fetchMonthData(year, month)

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
    <MonthlyClient
      initialYear={year}
      initialMonth={month}
      initialAssignments={assignments}
    />
  )
}
