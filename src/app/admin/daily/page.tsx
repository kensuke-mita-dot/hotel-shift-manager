import { fetchDayBoard } from '@/app/actions/board'
import { DailyClient } from './DailyClient'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export default async function DailyPage({
  searchParams,
}: {
  searchParams: { facility?: string; date?: string }
}) {
  const date     = DATE.test(searchParams.date ?? '') ? searchParams.date! : '2026-12-01'
  const facility = searchParams.facility ?? 'all'

  const board = await fetchDayBoard(date)

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

  return <DailyClient board={board} facility={facility} />
}
