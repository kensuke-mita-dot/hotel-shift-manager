import { fetchRequestBoard } from '@/app/actions/board'
import { nextMonthJST } from '@/lib/utils'
import { RequestsClient } from './RequestsClient'

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: { facility?: string; month?: string }
}) {
  const month    = /^\d{4}-\d{2}$/.test(searchParams.month ?? '') ? searchParams.month! : nextMonthJST()
  const facility = searchParams.facility ?? 'all'

  const board = await fetchRequestBoard(month)

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

  return <RequestsClient key={month} board={board} facility={facility} />
}
