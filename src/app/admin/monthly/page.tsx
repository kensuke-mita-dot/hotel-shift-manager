import { fetchMonthData } from '@/app/actions/shifts'
import { MonthlyClient } from './MonthlyClient'
import { todayJST } from '@/lib/utils'

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string }
}) {
  const [ty, tm] = todayJST().split('-').map(Number)
  const qy = parseInt(searchParams.year  ?? '')
  const qm = parseInt(searchParams.month ?? '')
  const year  = Number.isFinite(qy) ? qy : ty
  const month = Number.isFinite(qm) && qm >= 1 && qm <= 12 ? qm : tm

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
