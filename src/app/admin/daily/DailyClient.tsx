'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, X, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { addShift, removeShift, type DayBoard, type BoardShift, type BoardStaff } from '@/app/actions/board'
import { boardRows, kindLabel, hhmm, KIND_COLOR, KIND_CUSTOM, type BoardRow } from '@/lib/shift-kinds'
import { runAllChecks, coversSlot, type Violation } from '@/lib/rules'
import { addDays, weekday, WEEK_JA, cn } from '@/lib/utils'
import { REQUEST_LABEL } from '@/types'
import type { Facility, FacilitySlot } from '@/types'

export function DailyClient({ board, facility }: { board: DayBoard; facility: string }) {
  const { date } = board
  const router = useRouter()
  const visible = facility === 'all' ? board.facilities : board.facilities.filter(f => f.id === facility)

  const dayShifts = board.shifts.filter(s => s.date === date)
  const staffById = useMemo(() => new Map(board.staff.map(s => [s.id, s])), [board.staff])
  const requestBy = useMemo(() => new Map(board.requests.map(r => [r.staff_id, r])), [board.requests])

  const violations = useMemo(() => runAllChecks({
    shifts: board.shifts,
    slots: board.slots,
    requests: board.requests.map(r => ({ staff_id: r.staff_id, date: r.date, type: r.type })),
    facilityDates: board.facilities.map(f => ({ facilityId: f.id, date })),
  }), [board, date])

  const [y, m, d] = date.split('-').map(Number)
  const wd = weekday(date)
  const go = (to: string) => router.push(`/admin/daily?facility=${facility}&date=${to}`)

  // 誰もどこにも入っていない、シフト対象の人
  const assignedIds = new Set(dayShifts.map(s => s.staff_id))
  const scopeStaff = facility === 'all'
    ? board.staff
    : board.staff.filter(s => s.facilityIds.includes(facility))
  const unassigned = scopeStaff.filter(s => !assignedIds.has(s.id))

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* 日付 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-hs-text">日次調整</h1>
          <p className="text-xs text-hs-text-sub mt-0.5">下書きとして保存されます。スタッフに見えるのは「月間」で公開したあとです。</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => go(addDays(date, -1))} className="h-10 w-10 inline-flex items-center justify-center rounded-btn border border-hs-border bg-white" aria-label="前の日">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <label className="relative">
            <span className={cn('px-3 min-w-[140px] text-center inline-block font-medium',
              wd === 0 ? 'text-hs-danger' : wd === 6 ? 'text-hs-blue' : 'text-hs-text')}>
              {y}年{m}月{d}日（{WEEK_JA[wd]}）
            </span>
            <input type="date" value={date} onChange={e => e.target.value && go(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer" aria-label="日付を選ぶ" />
          </label>
          <button onClick={() => go(addDays(date, 1))} className="h-10 w-10 inline-flex items-center justify-center rounded-btn border border-hs-border bg-white" aria-label="次の日">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px] items-start">
        <div className="space-y-4">
          {visible.map(f => (
            <FacilityCard
              key={f.id}
              facility={f}
              slots={board.slots.filter(s => s.facility_id === f.id)}
              date={date}
              shifts={dayShifts.filter(s => s.facility_id === f.id)}
              allDayShifts={dayShifts}
              staff={board.staff}
              staffById={staffById}
              requestBy={requestBy}
              violations={violations.filter(v => relevant(v, f.id, date, board.shifts))}
              facilities={board.facilities}
              onChanged={() => router.refresh()}
            />
          ))}
        </div>

        {/* 未配置 */}
        <aside className="bg-white rounded-card border border-hs-border lg:sticky lg:top-40">
          <div className="px-4 py-3 border-b border-hs-border flex items-center justify-between">
            <span className="text-sm font-medium text-hs-text">この日に入っていない人</span>
            <span className="text-xs text-hs-text-sub">{unassigned.length}名</span>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto divide-y divide-hs-border">
            {unassigned.map(s => {
              const r = requestBy.get(s.id)
              return (
                <li key={s.id} className="px-4 py-2 flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-hs-text">
                    {s.fullName}
                    {s.isAdmin && <span className="ml-1 text-[10px] text-hs-text-lighter">管理者</span>}
                  </span>
                  <span className="text-xs text-hs-text-sub whitespace-nowrap">
                    {r ? `希望：${REQUEST_LABEL[r.type]}${r.type === 'custom' && r.start_time ? ` ${hhmm(r.start_time)}-${hhmm(r.end_time!)}` : ''}` : s.facilityIds.join('・') || '施設未設定'}
                  </span>
                </li>
              )
            })}
            {unassigned.length === 0 && (
              <li className="px-4 py-6 text-center text-xs text-hs-text-lighter">全員どこかに入っています</li>
            )}
          </ul>
        </aside>
      </div>
    </div>
  )
}

/** 施設カードに出す警告か */
function relevant(v: Violation, facilityId: string, date: string, shifts: BoardShift[]): boolean {
  if (v.type === 'understaffed') return v.facilityId === facilityId && v.date === date
  const involved = shifts.filter(s => v.shiftIds.includes(s.id))
  if (v.type === 'partial_both') return v.date === date && involved.some(s => s.facility_id === facilityId)
  // 勤務間隔・重複：この施設のこの日のシフトが関わるもの
  return involved.some(s => s.facility_id === facilityId && s.date === date)
}

// ─── 施設ごとのカード ─────────────────────────────────────────
function FacilityCard(props: {
  facility: Facility
  slots: FacilitySlot[]
  date: string
  shifts: BoardShift[]
  allDayShifts: BoardShift[]
  staff: BoardStaff[]
  staffById: Map<string, BoardStaff>
  requestBy: Map<string, DayBoard['requests'][number]>
  violations: Violation[]
  facilities: Facility[]
  onChanged: () => void
}) {
  const { facility, slots, shifts, violations } = props
  const rows = boardRows(slots)
  const slotLabel = (key: string) => kindLabel(key, slots)

  return (
    <section className="bg-white rounded-card border border-hs-border">
      <header className="px-4 py-3 border-b border-hs-border flex items-baseline gap-2">
        <span className="font-semibold text-hs-text">{facility.id}</span>
        <span className="text-xs text-hs-text-sub truncate">{facility.name}</span>
        <span className="ml-auto text-xs text-hs-text-sub">{new Set(shifts.map(s => s.staff_id)).size}名</span>
      </header>

      <div className="divide-y divide-hs-border">
        {rows.map(row => (
          <SlotRow key={row.kind} row={row} {...props}
            rowShifts={shifts.filter(s => s.kind === row.kind)}
            coverCount={row.min === null ? null : shifts.filter(s => coversSlot(s.kind, row.kind)).length}
          />
        ))}
      </div>

      {violations.length > 0 && (
        <ul className="px-4 py-3 border-t border-hs-border space-y-1 bg-hs-danger-bg/40">
          {violations.map((v, i) => {
            const who = v.staffId ? props.staffById.get(v.staffId)?.fullName : null
            const msg = v.type === 'understaffed' && v.slotKey
              ? v.message.replace(`${v.slotKey} 枠`, `${slotLabel(v.slotKey)}枠`)
              : v.message
            return (
              <li key={i} className="flex items-start gap-1.5 text-xs text-hs-danger">
                <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />
                <span>{who ? `${who}：` : ''}{msg}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ─── 枠ごとの行 ───────────────────────────────────────────────
function SlotRow(props: {
  row: BoardRow
  rowShifts: BoardShift[]
  coverCount: number | null
  facility: Facility
  date: string
  allDayShifts: BoardShift[]
  staff: BoardStaff[]
  staffById: Map<string, BoardStaff>
  requestBy: Map<string, DayBoard['requests'][number]>
  facilities: Facility[]
  onChanged: () => void
}) {
  const { row, rowShifts, coverCount, facility, date } = props
  const [adding, setAdding] = useState(false)
  const [pending, start] = useTransition()
  const short = coverCount !== null && row.min !== null && coverCount < row.min

  const remove = (s: BoardShift) => {
    start(async () => {
      const r = await removeShift(s.id)
      if (r.error) { toast.error(r.error); return }
      props.onChanged()
    })
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full" style={{ background: KIND_COLOR[row.kind] ?? '#999' }} />
        <span className="text-sm font-medium text-hs-text">{row.label}</span>
        {row.start && row.end && <span className="text-xs text-hs-text-sub">{hhmm(row.start)}〜{hhmm(row.end)}</span>}
        {row.kind === KIND_CUSTOM && <span className="text-xs text-hs-text-sub">時間を指定。枠の人数には数えません</span>}
        {coverCount !== null && row.min !== null && (
          <span className={cn('ml-auto text-xs px-2 py-0.5 rounded-chip font-medium',
            short ? 'bg-hs-danger text-white' : 'bg-hs-gray-light text-hs-text-sub')}>
            {coverCount}/{row.min}名
          </span>
        )}
        {row.kind === 'both' && <span className="ml-auto text-xs text-hs-text-lighter">朝枠・夕枠の両方に数えます</span>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {rowShifts.map(s => {
          const p = props.staffById.get(s.staff_id)
          const help = p && !p.facilityIds.includes(facility.id)
          return (
            <span key={s.id} className="inline-flex items-center gap-1 pl-2.5 pr-1 h-8 rounded-chip bg-hs-gray-light text-sm text-hs-text">
              {p?.fullName ?? '（削除済み）'}
              {row.kind === KIND_CUSTOM && <span className="text-xs text-hs-text-sub">{hhmm(s.start_time)}-{hhmm(s.end_time)}</span>}
              {help && <span className="text-[10px] px-1 rounded bg-hs-warn-bg text-hs-warn">ヘルプ</span>}
              <button onClick={() => remove(s)} disabled={pending}
                className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-white text-hs-text-lighter hover:text-hs-danger"
                aria-label={`${p?.fullName ?? ''}を外す`}>
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          )
        })}
        {!adding && (
          <button onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-chip border border-dashed border-hs-input-border text-sm text-hs-text-sub hover:border-hs-blue hover:text-hs-blue">
            <Plus className="w-3.5 h-3.5" />追加
          </button>
        )}
        {pending && <Loader2 className="w-4 h-4 animate-spin text-hs-text-lighter" />}
      </div>

      {adding && <AddForm {...props} onClose={() => setAdding(false)} />}
    </div>
  )
}

// ─── 追加フォーム ─────────────────────────────────────────────
function AddForm(props: {
  row: BoardRow
  facility: Facility
  date: string
  allDayShifts: BoardShift[]
  staff: BoardStaff[]
  requestBy: Map<string, DayBoard['requests'][number]>
  facilities: Facility[]
  onChanged: () => void
  onClose: () => void
}) {
  const { row, facility, date, allDayShifts, staff, requestBy } = props
  const [showAll, setShowAll] = useState(false)
  const [staffId, setStaffId] = useState('')
  const [startT, setStartT]   = useState('10:00')
  const [endT, setEndT]       = useState('15:00')
  const [pending, start]      = useTransition()

  const hereIds = new Set(allDayShifts.filter(s => s.facility_id === facility.id).map(s => s.staff_id))
  const candidates = staff
    .filter(s => !hereIds.has(s.id))
    .filter(s => showAll || s.facilityIds.includes(facility.id))

  const describe = (s: BoardStaff) => {
    const parts: string[] = []
    const r = requestBy.get(s.id)
    if (r) parts.push(`希望:${REQUEST_LABEL[r.type]}${r.type === 'custom' && r.start_time ? ` ${hhmm(r.start_time)}-${hhmm(r.end_time!)}` : ''}`)
    const elsewhere = allDayShifts.filter(x => x.staff_id === s.id && x.facility_id !== facility.id)
    if (elsewhere.length) parts.push(`${elsewhere.map(x => x.facility_id).join('・')}に配置済`)
    if (showAll && !s.facilityIds.includes(facility.id)) parts.push(`所属:${s.facilityIds.join('・') || 'なし'}`)
    return parts.length ? `（${parts.join(' / ')}）` : ''
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!staffId) { toast.error('スタッフを選んでください'); return }
    start(async () => {
      const r = await addShift({
        facilityId: facility.id, date, staffId, kind: row.kind,
        ...(row.kind === KIND_CUSTOM ? { start: startT, end: endT } : {}),
      })
      if (r.error) { toast.error(r.error); return }
      setStaffId('')
      props.onChanged()
      props.onClose()
    })
  }

  return (
    <form onSubmit={submit} className="mt-2 p-3 rounded-btn bg-hs-gray-lighter border border-hs-border flex flex-wrap items-end gap-2">
      <div className="flex-1 min-w-[200px]">
        <label className="text-xs text-hs-text-sub block mb-1">{row.label}に入れる人</label>
        <select value={staffId} onChange={e => setStaffId(e.target.value)} autoFocus
          className="w-full h-10 px-2 rounded-btn border border-hs-input-border bg-white text-base md:text-sm">
          <option value="">選んでください</option>
          {candidates.map(s => (
            <option key={s.id} value={s.id}>{s.fullName}{s.isAdmin ? '（管理者）' : ''}{describe(s)}</option>
          ))}
        </select>
        <label className="mt-1.5 flex items-center gap-1.5 text-xs text-hs-text-sub cursor-pointer">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
          他施設のスタッフも表示（ヘルプで入れる）
        </label>
      </div>
      {row.kind === KIND_CUSTOM && (
        <div className="flex items-end gap-1">
          <div>
            <label className="text-xs text-hs-text-sub block mb-1">開始</label>
            <input type="time" value={startT} onChange={e => setStartT(e.target.value)} step={900}
              className="h-10 px-2 rounded-btn border border-hs-input-border bg-white text-base md:text-sm" />
          </div>
          <span className="pb-2 text-hs-text-sub">〜</span>
          <div>
            <label className="text-xs text-hs-text-sub block mb-1">終了</label>
            <input type="time" value={endT} onChange={e => setEndT(e.target.value)} step={900}
              className="h-10 px-2 rounded-btn border border-hs-input-border bg-white text-base md:text-sm" />
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={props.onClose}
          className="h-10 px-3 rounded-btn border border-hs-border bg-white text-sm text-hs-text-sub">やめる</button>
        <button type="submit" disabled={pending}
          className="h-10 px-4 rounded-btn bg-hs-blue hover:bg-hs-blue-hover text-white text-sm font-medium disabled:opacity-50">
          {pending ? '追加中...' : '追加'}
        </button>
      </div>
      {candidates.length === 0 && (
        <p className="w-full text-xs text-hs-text-sub">
          候補がいません。{showAll ? '' : '「他施設のスタッフも表示」で探すか、'}<Link href="/admin/staff" className="underline">スタッフ</Link>で所属施設を設定してください。
        </p>
      )}
    </form>
  )
}
