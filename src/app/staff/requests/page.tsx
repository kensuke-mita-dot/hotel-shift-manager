import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { fetchRequestsData, requestMonths } from '@/app/actions/requests'
import { WishCalendar } from '@/components/staff/WishCalendar'
import { REQUESTS_ENABLED } from '@/types'

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: { month?: string }
}) {
  // 希望は別ツールで集めるため、当面は確定シフトへ
  if (!REQUESTS_ENABLED) redirect('/staff/schedule')

  const user = await getSessionUser()
  if (!user) redirect('/login')

  const months = await requestMonths()
  const month  = months.includes(searchParams.month ?? '') ? searchParams.month! : months[0]
  const data   = await fetchRequestsData(user.id, month)

  return (
    <WishCalendar
      key={month}
      month={month}
      months={months}
      initialRequests={data.requests}
      submittedAt={data.submittedAt}
      extendedUntil={data.extendedUntil}
      primaryFacilitySlots={data.primaryFacilitySlots}
      availableSlotKeys={data.availableSlotKeys}
      deadlineDate={data.deadlineDate}
    />
  )
}
