'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const FACILITIES = [
  { label: '全施設', param: 'all' },
  { label: 'BHJ',   param: 'BHJ'  },
  { label: 'BHKK',  param: 'BHKK' },
  { label: 'MAHB',  param: 'MAHB' },
  { label: 'MAHT',  param: 'MAHT' },
  { label: 'MAHNM', param: 'MAHNM'},
] as const

function AdminTabsInner() {
  const pathname    = usePathname()
  const searchParams = useSearchParams()

  const facility = searchParams.get('facility') ?? 'all'
  const date     = searchParams.get('date')     ?? '2026-12-01'
  const month    = searchParams.get('month')    ?? '2026-12'

  const isDaily   = pathname.startsWith('/admin/daily')
  const isMonthly = pathname.startsWith('/admin/monthly')
  const isStaff   = pathname.startsWith('/admin/staff')

  // タブリンク（施設パラメータを引き継ぐ）
  const dailyHref   = `/admin/daily?facility=${facility}&date=${date}`
  const monthlyHref = `/admin/monthly?facility=${facility}&month=${month}`
  const staffHref   = '/admin/staff'

  // 施設切り替えリンク（ページ・日付・月を引き継ぐ）
  const facilityHref = (param: string) => {
    if (isDaily)   return `/admin/daily?facility=${param}&date=${date}`
    if (isMonthly) return `/admin/monthly?facility=${param}&month=${month}`
    return `?facility=${param}`
  }

  const showFacilitySwitcher = isDaily || isMonthly

  return (
    <div className="sticky top-14 z-20 bg-white border-b border-hs-border">
      {/* タブ */}
      <div className="flex px-2">
        <TabLink href={dailyHref}   active={isDaily}>日次調整</TabLink>
        <TabLink href={monthlyHref} active={isMonthly}>月間</TabLink>
        <TabLink href={staffHref}   active={isStaff}>スタッフ</TabLink>
      </div>

      {/* 施設切り替え */}
      {showFacilitySwitcher && (
        <div className="flex items-center gap-1.5 px-4 pb-2.5 overflow-x-auto scrollbar-none">
          {FACILITIES.map(({ label, param }) => {
            const active = facility === param
            return (
              <Link
                key={param}
                href={facilityHref(param)}
                className={`flex-shrink-0 px-3 h-8 flex items-center rounded-[6px] text-sm font-medium transition-colors
                  ${active
                    ? 'bg-hs-blue text-white'
                    : 'bg-hs-gray-light text-hs-text hover:bg-hs-blue-bg hover:text-hs-blue'
                  }`}
              >
                {label}
              </Link>
            )
          })}
        </div>
      )}
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

export function AdminTabs() {
  return (
    <Suspense fallback={<div className="h-[92px] bg-white border-b border-hs-border" />}>
      <AdminTabsInner />
    </Suspense>
  )
}
