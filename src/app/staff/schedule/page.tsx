import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import { getSessionUser } from '@/lib/session'
import { todayJST, monthRange, weekday, WEEK_JA, cn } from '@/lib/utils'
import { KIND_COLOR, hhmm, isWorkKind, kindLabel, KIND_BOTH, KIND_CUSTOM } from '@/lib/shift-kinds'
import { adoptionStats, requestOutcome, requestText, type RequestOutcome } from '@/lib/requests'
import { loadTeamSchedule, type TeamShift } from '@/lib/staff-schedule'
import type { FacilitySlot, RequestType } from '@/types'

const pad = (n: number) => String(n).padStart(2, '0')

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`
}

/** シフトの呼び名（朝勤・夕勤・朝夕（通し）・浮き・基本・休み・有給） */
function shiftName(kind: string, slots: FacilitySlot[], fid?: string): string {
  if (!isWorkKind(kind)) return kindLabel(kind, [])
  if (kind === KIND_BOTH) return '朝夕（通し）'
  if (kind === KIND_CUSTOM) return '浮き'
  const s = slots.find(x => x.key === kind && (!fid || x.facility_id === fid))
  if (kind === 'base') return '基本'
  return s ? `${s.label}勤` : kind
}

const OUTCOME: Record<RequestOutcome, { label: string; cls: string }> = {
  match:   { label: '希望どおり', cls: 'bg-green-50 text-green-700 border-green-200' },
  changed: { label: '時間帯変更', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  skipped: { label: '見送り',     cls: 'bg-hs-gray-light text-hs-text-sub border-hs-border' },
  on_off:  { label: '×の日に勤務', cls: 'bg-hs-danger-bg text-hs-danger border-hs-danger-border' },
}

/** 施設タブで並べる順（朝 → 通し → 夕 → 夜 → 基本 → 浮き） */
const KIND_ORDER = ['morning', 'both', 'evening', 'night', 'base', 'custom']

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { month?: string; pin?: string; view?: string; facility?: string }
}) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const today = todayJST()
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? '') ? searchParams.month! : today.slice(0, 7)
  const view: 'me' | 'team' = searchParams.view === 'team' ? 'team' : 'me'
  const [y, m] = month.split('-').map(Number)
  const q = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const v = { month, view, facility: searchParams.facility, ...patch }
    Object.entries(v).forEach(([k, val]) => { if (val) p.set(k, val) })
    return `/staff/schedule?${p.toString()}`
  }

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
          <Link href={q({ month: shiftMonth(month, -1) })}
            className="h-10 w-10 inline-flex items-center justify-center rounded-btn border border-hs-border bg-white" aria-label="前の月">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <span className="text-sm font-medium min-w-[92px] text-center">{y}年{m}月</span>
          <Link href={q({ month: shiftMonth(month, 1) })}
            className="h-10 w-10 inline-flex items-center justify-center rounded-btn border border-hs-border bg-white" aria-label="次の月">
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* 自分／施設 の切り替え */}
      <div className="grid grid-cols-2 p-1 rounded-btn bg-hs-gray-light text-sm font-medium" role="tablist">
        {([['me', '自分のシフト'], ['team', '施設のシフト']] as const).map(([v, label]) => (
          <Link key={v} href={q({ view: v })} role="tab" aria-selected={view === v}
            className={cn('h-9 inline-flex items-center justify-center rounded-[6px] transition-colors',
              view === v ? 'bg-white text-hs-text shadow-sm' : 'text-hs-text-sub hover:text-hs-text')}>
            {label}
          </Link>
        ))}
      </div>

      {view === 'me'
        ? <MyView userId={user.id} month={month} today={today} nextMonthHref={q({ month: shiftMonth(month, 1) })} />
        : <TeamView userId={user.id} month={month} today={today} facility={searchParams.facility} q={q} />}
    </div>
  )
}

// ─── 自分のシフト：確定シフトと希望の照合 ─────────────────────
async function MyView({ userId, month, today, nextMonthHref }: {
  userId: string; month: string; today: string; nextMonthHref: string
}) {
  const supabase = createClient()
  const { from, to } = monthRange(month)
  const [shRes, rqRes, fRes, slRes] = await Promise.all([
    supabase.from('published_shifts')
      .select('id, facility_id, date, kind, start_time, end_time')
      .eq('staff_id', userId).gte('date', from).lte('date', to)
      .order('date').order('start_time'),
    supabase.from('shift_requests').select('date, type, start_time, end_time')
      .eq('staff_id', userId).gte('date', from).lte('date', to),
    supabase.from('facilities').select('id, name'),
    supabase.from('facility_slots').select('*'),
  ])
  if (shRes.error) {
    return <div className="bg-hs-danger-bg border border-hs-danger-border rounded-card p-4 text-sm text-hs-danger">
      シフトを読み込めませんでした：{shRes.error.message}
    </div>
  }

  const shifts = shRes.data ?? []
  const requests = (rqRes.data ?? []) as { date: string; type: RequestType; start_time: string | null; end_time: string | null }[]
  const slots = (slRes.data ?? []) as FacilitySlot[]
  const facilityName = new Map((fRes.data ?? []).map(f => [f.id, f.name]))
  const [, mm] = month.split('-').map(Number)

  if (shifts.length === 0) {
    return (
      <div className="bg-white rounded-card border border-hs-border p-8 text-center text-sm text-hs-text-sub">
        {mm}月の確定シフトはまだ公開されていません。
        <Link href={nextMonthHref} className="block mt-3 text-hs-blue underline">次の月を見る →</Link>
      </div>
    )
  }

  const workDays = new Set(shifts.filter(s => isWorkKind(s.kind)).map(s => s.date)).size
  const ad = adoptionStats(requests, shifts)
  const rate = ad.requested > 0 ? Math.round((ad.adopted / ad.requested) * 100) : null

  // シフトか希望がある日を並べる（×の希望どおり休みの日は省く）
  const shiftsBy = new Map<string, typeof shifts>()
  for (const s of shifts) shiftsBy.set(s.date, [...(shiftsBy.get(s.date) ?? []), s])
  const reqBy = new Map<string, typeof requests>()
  for (const r of requests) reqBy.set(r.date, [...(reqBy.get(r.date) ?? []), r])
  const dates = Array.from(new Set([...Array.from(shiftsBy.keys()), ...Array.from(reqBy.keys())])).sort()
    .filter(d => shiftsBy.has(d) || requestOutcome(reqBy.get(d) ?? [], []) !== null)

  return (
    <>
      <div className="grid grid-cols-2 bg-white rounded-card border border-hs-border divide-x divide-hs-border">
        <div className="p-3 text-center">
          <div className="text-xs text-hs-text-sub">出勤</div>
          <div className="text-xl font-semibold text-hs-text tabular-nums">{workDays}<span className="text-sm font-normal ml-0.5">日</span></div>
        </div>
        <div className="p-3 text-center">
          <div className="text-xs text-hs-text-sub">希望の採用</div>
          <div className="text-xl font-semibold text-hs-text tabular-nums">
            {rate === null ? <span className="text-sm font-normal text-hs-text-lighter">希望なし</span> : (
              <>{ad.adopted}<span className="text-sm font-normal text-hs-text-sub"> / {ad.requested}日</span>
                <span className="text-xs font-normal text-hs-text-sub ml-1">（{rate}%）</span></>
            )}
          </div>
        </div>
      </div>

      <ul className="bg-white rounded-card border border-hs-border divide-y divide-hs-border">
        {dates.map(d => {
          const wd = weekday(d)
          const isToday = d === today
          const list = shiftsBy.get(d) ?? []
          const reqs = reqBy.get(d) ?? []
          const outcome = requestOutcome(reqs, list.map(s => s.kind))
          return (
            <li key={d} className={cn('flex gap-3 px-4 py-3', d < today && 'opacity-50', isToday && 'bg-hs-blue-bg')}>
              <div className="w-10 text-center flex-shrink-0">
                <div className="text-lg font-semibold text-hs-text leading-none">{Number(d.slice(8))}</div>
                <div className={cn('text-xs mt-0.5', wd === 0 ? 'text-hs-danger' : wd === 6 ? 'text-hs-blue' : 'text-hs-text-lighter')}>
                  {WEEK_JA[wd]}{isToday && '・今日'}
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                {list.length === 0 ? (
                  <div className="flex items-center gap-3">
                    <div className="w-1 self-stretch rounded-full border-l-2 border-dashed border-hs-border" />
                    <div className="text-sm text-hs-text-lighter">勤務なし</div>
                  </div>
                ) : list.map(s => (
                  <div key={s.id} className="flex items-center gap-3">
                    <div className="w-1 self-stretch rounded-full" style={{ background: KIND_COLOR[s.kind] ?? '#999' }} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-hs-text">
                        {shiftName(s.kind, slots, s.facility_id)}
                        {isWorkKind(s.kind) && <span className="ml-2 text-xs font-normal text-hs-text-sub tabular-nums">{hhmm(s.start_time)}〜{hhmm(s.end_time)}</span>}
                      </div>
                      <div className="text-xs text-hs-text-sub truncate">{facilityName.get(s.facility_id) ?? s.facility_id}</div>
                    </div>
                  </div>
                ))}
                {reqs.length > 0 && (
                  <div className="flex items-center gap-2 pl-4 text-xs">
                    <span className="text-hs-text-lighter">希望：{requestText(reqs)}</span>
                    {outcome && (
                      <span className={cn('px-1.5 py-px rounded border text-[11px] font-medium', OUTCOME[outcome].cls)}>
                        {OUTCOME[outcome].label}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}

// ─── 施設のシフト：所属施設と MAHB の公開済みシフト ─────────────
async function TeamView({ userId, month, today, facility, q }: {
  userId: string; month: string; today: string; facility?: string
  q: (patch: Record<string, string | undefined>) => string
}) {
  const t = await loadTeamSchedule(userId, month, facility)
  const [, mm] = month.split('-').map(Number)
  const current = t.facilities.find(f => f.id === t.facilityId)
  const dates = Array.from(t.byDate.keys()).sort()

  return (
    <>
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
        {t.facilities.map(f => (
          <Link key={f.id} href={q({ facility: f.id })} aria-pressed={f.id === t.facilityId}
            className={cn('h-9 px-3 inline-flex items-center rounded-btn text-sm font-medium whitespace-nowrap',
              f.id === t.facilityId ? 'bg-hs-blue text-white' : 'bg-white border border-hs-border text-hs-text hover:bg-hs-blue-bg')}>
            {f.id}
          </Link>
        ))}
      </div>

      {t.error ? (
        <div className="bg-hs-danger-bg border border-hs-danger-border rounded-card p-4 text-sm text-hs-danger">
          シフトを読み込めませんでした：{t.error}
        </div>
      ) : dates.length === 0 ? (
        <div className="bg-white rounded-card border border-hs-border p-8 text-center text-sm text-hs-text-sub">
          {current?.name ?? ''}の{mm}月の確定シフトはまだ公開されていません。
        </div>
      ) : (
        <>
          <p className="text-xs text-hs-text-sub">{current?.name}<span className="text-hs-text-lighter">　公開済み・休みと有給は出しません</span></p>
          <ul className="bg-white rounded-card border border-hs-border divide-y divide-hs-border">
            {dates.map(d => {
              const wd = weekday(d)
              const isToday = d === today
              const groups = groupByKind(t.byDate.get(d) ?? [])
              return (
                <li key={d} className={cn('flex gap-3 px-4 py-3', d < today && 'opacity-50', isToday && 'bg-hs-blue-bg')}>
                  <div className="w-10 text-center flex-shrink-0">
                    <div className="text-lg font-semibold text-hs-text leading-none">{Number(d.slice(8))}</div>
                    <div className={cn('text-xs mt-0.5', wd === 0 ? 'text-hs-danger' : wd === 6 ? 'text-hs-blue' : 'text-hs-text-lighter')}>
                      {WEEK_JA[wd]}{isToday && '・今日'}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {groups.map(([kind, list]) => (
                      <div key={kind} className="flex items-start gap-2 text-sm">
                        <span className="flex-shrink-0 mt-px w-11 text-center rounded text-[11px] font-medium text-white leading-[18px]"
                          style={{ background: KIND_COLOR[kind] ?? '#888' }}>
                          {kind === KIND_BOTH ? '通し' : shiftName(kind, t.slots)}
                        </span>
                        <span className="min-w-0 text-hs-text leading-5">
                          {list.map((s, i) => (
                            <span key={s.staffId + i} className="whitespace-nowrap">
                              {i > 0 && <span className="text-hs-text-lighter">、</span>}
                              <span className={cn(s.staffId === userId && 'font-semibold text-hs-blue')}>{s.name}</span>
                              {showTime(kind, list) && (
                                <span className="ml-1 text-xs text-hs-text-sub tabular-nums">{hhmm(s.start)}-{hhmm(s.end)}</span>
                              )}
                            </span>
                          ))}
                          {!showTime(kind, list) && list[0] && (
                            <span className="ml-1.5 text-xs text-hs-text-sub tabular-nums">{hhmm(list[0].start)}-{hhmm(list[0].end)}</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}

/** 勤務の種類ごとにまとめる（朝 → 通し → 夕 → 夜 → 基本 → 浮き） */
function groupByKind(list: TeamShift[]): [string, TeamShift[]][] {
  const map = new Map<string, TeamShift[]>()
  for (const s of list) map.set(s.kind, [...(map.get(s.kind) ?? []), s])
  const rank = (k: string) => { const i = KIND_ORDER.indexOf(k); return i < 0 ? 99 : i }
  return Array.from(map.entries()).sort((a, b) => rank(a[0]) - rank(b[0]))
}

/** 人ごとに時刻を出すか（浮き、または同じ種類でも時刻が人によって違うとき） */
function showTime(kind: string, list: TeamShift[]): boolean {
  if (kind === KIND_CUSTOM) return true
  return new Set(list.map(s => `${s.start}-${s.end}`)).size > 1
}
