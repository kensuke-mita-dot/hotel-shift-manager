import { fetchMonthBoard } from '@/app/actions/board'
import { MonthlyClient } from './MonthlyClient'

import { nextMonthJST } from '@/lib/utils'

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: { facility?: string; month?: string }
}) {
  const month    = /^\d{4}-\d{2}$/.test(searchParams.month ?? '') ? searchParams.month! : nextMonthJST()
  const facility = searchParams.facility ?? 'all'

  const board = await fetchMonthBoard(month)

  if (board.error) {
    return (
      <div className="p-6">
        <div className="bg-hs-danger-bg border border-hs-danger-border rounded-card p-4 text-sm text-hs-danger">
          <p className="font-medium mb-1">データ取得エラー</p>
          <p>{board.error}</p>
        </div>
      </div>
    )
  }

  return <MonthlyClient board={board} facility={facility} />
}
