import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import { todayJST, monthRange, weekday, WEEK_JA, cn } from '@/lib/utils'
import { KIND_COLOR, hhmm } from '@/lib/shift-kinds'
import type { FacilitySlot } from '@/types'

const pad = (n: number) => String(n).padStart(2, '0')

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { month?: string; pin?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = todayJST()
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? '') ? searchParams.month! : today.slice(0, 7)
  const { from, to } = monthRange(month)
  const [y, m] = month.split('-').map(Number)

  const [shRes, fRes, slRes] = await Promise.all([
    supabase.from('published_shifts')
      .select('id, facility_id, date, kind, start_time, end_time')
      .eq('staff_id', user.id)
      .gte('date', from).lte('date', to)
      .order('date').order('start_time'),
    supabase.from('facilities').select('id, name'),
    supabase.from('facility_slots').select('*'),
  ])

  const facilityName = new Map((fRes.data ?? []).map(f => [f.id, f.name]))
  const slots = (slRes.data ?? []) as FacilitySlot[]
  const label = (fid: string, kind: string) => {
    if (kind === 'both') return '朝夕（通し）'
    if (kind === 'custom') return '浮き'
    const s = slots.find(x => x.facility_id === fid && x.key === kind)
    return s ? (s.key === 'base' ? '基本' : `${s.label}勤`) : kind
  }

  const shifts = shRes.data ?? []
  const workDays = new Set(shifts.map(s => s.date)).size

  return (
    <div className="p-4 space-y-4">
      {searchParams.pin === 'changed' && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-btn px-3 py-2 text-sm text-green-800">
          <CheckCircle2 className="w-4 h-4" />
          PINを変更しました。次回から新しいPINでログインしてください。
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-hs-text">確定シフト</h1>
        <div className="flex items-center gap-1">
          <Link href={`/staff/schedule?month=${shiftMonth(month, -1)}`}
            className="h-10 w-10 inline-flex items-center justify-center rounded-btn border border-hs-border bg-white" aria-label="前の月">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <span className="text-sm font-medium min-w-[92px] text-center">{y}年{m}月</span>
          <Link href={`/staff/schedule?month=${shiftMonth(month, 1)}`}
            className="h-10 w-10 inline-flex items-center justify-center rounded-btn border border-hs-border bg-white" aria-label="次の月">
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {shRes.error ? (
        <div className="bg-hs-danger-bg border border-hs-danger-border rounded-card p-4 text-sm text-hs-danger">
          シフトを読み込めませんでした：{shRes.error.message}
        </div>
      ) : shifts.length === 0 ? (
        <div className="bg-white rounded-card border border-hs-border p-8 text-center text-sm text-hs-text-sub">
          {y}年{m}月の確定シフトはまだ公開されていません。
          <Link href={`/staff/schedule?month=${shiftMonth(month, 1)}`} className="block mt-3 text-hs-blue underline">
            {shiftMonth(month, 1).split('-').map(Number)[1]}月を見る →
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-hs-text-sub">出勤 {workDays}日</p>
          <ul className="bg-white rounded-card border border-hs-border divide-y divide-hs-border">
            {shifts.map(s => {
              const wd = weekday(s.date)
              const isToday = s.date === today
              return (
                <li key={s.id} className={cn('flex items-center gap-3 px-4 py-3', s.date < today && 'opacity-50', isToday && 'bg-hs-blue-bg')}>
                  <div className="w-12 text-center">
                    <div className="text-lg font-semibold text-hs-text leading-none">{Number(s.date.slice(8))}</div>
                    <div className={cn('text-xs mt-0.5', wd === 0 ? 'text-hs-danger' : wd === 6 ? 'text-hs-blue' : 'text-hs-text-lighter')}>
                      {WEEK_JA[wd]}{isToday && '・今日'}
                    </div>
                  </div>
                  <div className="w-1 self-stretch rounded-full" style={{ background: KIND_COLOR[s.kind] ?? '#999' }} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-hs-text">
                      {label(s.facility_id, s.kind)}
                      <span className="ml-2 text-xs font-normal text-hs-text-sub">{hhmm(s.start_time)}〜{hhmm(s.end_time)}</span>
                    </div>
                    <div className="text-xs text-hs-text-sub truncate">{facilityName.get(s.facility_id) ?? s.facility_id}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
