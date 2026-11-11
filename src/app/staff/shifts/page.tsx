import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import { todayJST, cn } from '@/lib/utils'
import { SLOT_META } from '@/types'
import type { ShiftSlot } from '@/types'

const WEEK = ['日', '月', '火', '水', '木', '金', '土']
const SLOT_ORDER: ShiftSlot[] = ['morning', 'evening', 'night']

export default async function MyShiftsPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string; pin?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = todayJST()
  const [ty, tm] = today.split('-').map(Number)
  const qy = parseInt(searchParams.year  ?? '')
  const qm = parseInt(searchParams.month ?? '')
  const year  = Number.isFinite(qy) ? qy : ty
  const month = Number.isFinite(qm) && qm >= 1 && qm <= 12 ? qm : tm

  const prev = month === 1  ? { y: year - 1, m: 12 } : { y: year, m: month - 1 }
  const next = month === 12 ? { y: year + 1, m: 1 }  : { y: year, m: month + 1 }

  const pad      = (n: number) => String(n).padStart(2, '0')
  const lastDay  = new Date(year, month, 0).getDate()
  const from     = `${year}-${pad(month)}-01`
  const to       = `${year}-${pad(month)}-${pad(lastDay)}`

  const { data, error } = await supabase
    .from('shifts')
    .select('shift_date, slot')
    .eq('staff_id', user.id)
    .eq('is_confirmed', true)
    .gte('shift_date', from)
    .lte('shift_date', to)
    .order('shift_date')

  const shifts = (data ?? []).sort((a, b) =>
    a.shift_date === b.shift_date
      ? SLOT_ORDER.indexOf(a.slot as ShiftSlot) - SLOT_ORDER.indexOf(b.slot as ShiftSlot)
      : a.shift_date.localeCompare(b.shift_date),
  )

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-md mx-auto">

        {searchParams.pin === 'changed' && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-800 mb-4">
            <CheckCircle2 className="w-4 h-4" />
            PINを変更しました。次回から新しいPINでログインしてください。
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-gray-900">わたしのシフト</h1>
          <div className="flex items-center gap-1">
            <Link
              href={`/staff/shifts?year=${prev.y}&month=${prev.m}`}
              className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white"
              aria-label="前の月"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <span className="text-sm font-medium min-w-[88px] text-center">{year}年{month}月</span>
            <Link
              href={`/staff/shifts?year=${next.y}&month=${next.m}`}
              className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white"
              aria-label="次の月"
            >
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {error ? (
          <div className="bg-white border border-red-200 rounded-xl p-4 text-sm text-red-700">
            シフトを読み込めませんでした：{error.message}
          </div>
        ) : shifts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
            この月の確定シフトはまだありません。
            <Link href="/staff/wishes" className="block mt-3 text-gray-900 underline underline-offset-2">
              希望を入力する →
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-2">出勤 {new Set(shifts.map(s => s.shift_date)).size}日</p>
            <ul className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {shifts.map(s => {
                const meta = SLOT_META[s.slot as ShiftSlot]
                const dow  = new Date(Date.UTC(year, month - 1, Number(s.shift_date.slice(8)))).getUTCDay()
                const isToday = s.shift_date === today
                const isPast  = s.shift_date < today
                return (
                  <li
                    key={`${s.shift_date}-${s.slot}`}
                    className={cn('flex items-center gap-3 px-4 py-3', isPast && 'opacity-50', isToday && 'bg-amber-50')}
                  >
                    <div className="w-12 text-center">
                      <div className="text-lg font-semibold text-gray-900 leading-none">{Number(s.shift_date.slice(8))}</div>
                      <div className={cn('text-xs mt-0.5', dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-400')}>
                        {WEEK[dow]}{isToday && '・今日'}
                      </div>
                    </div>
                    <div className="w-1 self-stretch rounded-full" style={{ background: meta.color }} />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{meta.label}</div>
                      <div className="text-xs text-gray-500">{meta.time}</div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
