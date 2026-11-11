import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { fetchRequestsData } from '@/app/actions/requests'
import { WishCalendar } from '@/components/staff/WishCalendar'

export default async function RequestsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const data = await fetchRequestsData(user.id)

  return (
    <WishCalendar
      initialRequests={data.requests}
      submittedAt={data.submittedAt}
      extendedUntil={data.extendedUntil}
      primaryFacilitySlots={data.primaryFacilitySlots}
      availableSlotKeys={data.availableSlotKeys}
      deadlineDate={data.deadlineDate}
    />
  )
}
