'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function StaffTabs() {
  const pathname = usePathname()
  const isRequests = pathname.startsWith('/staff/requests')
  const isSchedule = pathname.startsWith('/staff/schedule')

  return (
    <div className="sticky top-14 z-20 bg-white border-b border-hs-border flex px-2">
      <TabLink href="/staff/requests" active={isRequests}>希望入力</TabLink>
      <TabLink href="/staff/schedule" active={isSchedule}>確定シフト</TabLink>
    </div>
  )
}

function TabLink({
  href, active, children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
        ${active
          ? 'text-hs-blue border-hs-blue'
          : 'text-hs-text-sub border-transparent hover:text-hs-text'
        }`}
    >
      {children}
    </Link>
  )
}
