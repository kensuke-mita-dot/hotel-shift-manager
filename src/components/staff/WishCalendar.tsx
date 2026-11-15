'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { BottomSheet } from '@/components/layout/BottomSheet'
import { saveAndSubmitRequests } from '@/app/actions/requests'
import type { RequestType, ShiftRequest, FacilitySlot } from '@/types'
import { REQUEST_LABEL } from '@/types'
import { fmtTimeRange } from '@/lib/time'
import { normalizeRequests, requestText, validateDayRequests, MAX_TIME_RANGES } from '@/lib/requests'

// ─── Calendar ────────────────────────────────────────────────────

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

/** 'YYYY-MM' からカレンダーを組み立てる */
function buildCalendar(month: string) {
  const [year, mon] = month.split('-').map(Number)
  const days = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  const firstDow = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay()
  const cells: (number | null)[] = Array(firstDow).fill(null)
  for (let d = 1; d <= days; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return {
    year, mon, days, cells,
    dateStr: (d: number) => `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    dowOfDay: (d: number) => (firstDow + d - 1) % 7,
  }
}

// ─── Time helpers ────────────────────────────────────────────────

function slotTimeLabel(slots: FacilitySlot[], key: string): string {
  const s = slots.find(sl => sl.key === key)
  return s ? fmtTimeRange(s.start_time, s.end_time) : ''
}

function fmtSubmitted(iso: string): string {
  const d = new Date(iso)
  const jst = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const h = String(jst.getHours()).padStart(2, '0')
  const min = String(jst.getMinutes()).padStart(2, '0')
  return `提出済 ${jst.getMonth() + 1}/${jst.getDate()} ${h}:${min}`
}

// ─── Types ───────────────────────────────────────────────────────

interface RequestEntry {
  type: RequestType
  start_time?: string | null
  end_time?: string | null
}

interface SlotOption {
  type: RequestType
  label: string
  timeLabel: string
}

interface Props {
  /** 対象月 'YYYY-MM' */
  month: string
  /** 希望を出せる月（切り替え用） */
  months: string[]
  initialRequests: ShiftRequest[]
  submittedAt: string | null
  extendedUntil: string | null
  primaryFacilitySlots: FacilitySlot[]
  availableSlotKeys: string[]
  deadlineDate: string
}

// ─── WishCalendar ────────────────────────────────────────────────

export function WishCalendar({
  month,
  months,
  initialRequests,
  submittedAt: initialSubmittedAt,
  extendedUntil,
  primaryFacilitySlots,
  availableSlotKeys,
  deadlineDate,
}: Props) {
  const cal = buildCalendar(month)
  const DAYS_IN_MONTH = cal.days
  const dateStr = cal.dateStr
  const dowOfDay = cal.dowOfDay
  // 1日に複数の希望を持てる（例：朝と夜のどちらでも可）。「休」は単独
  const [local, setLocal] = useState<Map<string, RequestEntry[]>>(() => {
    const m = new Map<string, RequestEntry[]>()
    for (const r of initialRequests) {
      m.set(r.date, [...(m.get(r.date) ?? []), { type: r.type, start_time: r.start_time, end_time: r.end_time }])
    }
    return m
  })
  const [isDirty, setIsDirty] = useState(false)
  const [submittedAt, setSubmittedAt] = useState(initialSubmittedAt)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Deadline
  const deadline = new Date(deadlineDate + 'T23:59:59+09:00')
  const extended = extendedUntil ? new Date(extendedUntil + 'T23:59:59+09:00') : null
  const isLocked = new Date() > (extended ?? deadline)

  // Deadline label
  const dl = new Date(deadlineDate + 'T00:00:00')
  const dlLabel = `${dl.getMonth() + 1}/${dl.getDate()}（${DAY_NAMES[dl.getDay()]}）`
  const extLabel = (() => {
    if (!extendedUntil) return null
    const ed = new Date(extendedUntil + 'T00:00:00')
    return `→ 延長 ${ed.getMonth() + 1}/${ed.getDate()}（${DAY_NAMES[ed.getDay()]}）まで`
  })()

  // Available slot types from staff's facilities
  const hasSlot = (k: string) => availableSlotKeys.includes(k)
  const slotOptions: SlotOption[] = [
    ...(hasSlot('morning') ? [{ type: 'morning' as RequestType, label: '朝', timeLabel: slotTimeLabel(primaryFacilitySlots, 'morning') }] : []),
    ...(hasSlot('evening') ? [{ type: 'evening' as RequestType, label: '夕', timeLabel: slotTimeLabel(primaryFacilitySlots, 'evening') }] : []),
    ...(hasSlot('morning') && hasSlot('evening') ? [{ type: 'both' as RequestType, label: '朝夕', timeLabel: '' }] : []),
    ...(hasSlot('night') ? [{ type: 'night' as RequestType, label: '夜', timeLabel: slotTimeLabel(primaryFacilitySlots, 'night') }] : []),
    { type: 'custom', label: '時間指定', timeLabel: '' },
    { type: 'off', label: '休', timeLabel: '' },
  ]

  // Status tag
  const statusTag = (() => {
    if (isDirty) return { text: '未保存の変更あり', cls: 'bg-orange-50 text-orange-600 border-orange-200' }
    if (submittedAt) return { text: fmtSubmitted(submittedAt), cls: 'bg-hs-blue-bg text-hs-blue border-hs-border' }
    return { text: '未提出', cls: 'bg-hs-gray-light text-hs-text-sub border-hs-border' }
  })()

  // Counts
  const counts: Record<RequestType, number> = { morning: 0, evening: 0, both: 0, night: 0, custom: 0, off: 0 }
  Array.from(local.values()).forEach(list => list.forEach(e => { counts[e.type]++ }))
  const emptyCount = DAYS_IN_MONTH - local.size
  const emptyDays = Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1).filter(d => !local.has(dateStr(d)))

  const buttonLabel = submittedAt ? '変更を保存して再提出' : '保存して提出'

  function handleDayClick(d: number) {
    if (isLocked) { toast.error('提出期限を過ぎたため変更できません。'); return }
    setSelectedDate(dateStr(d))
  }

  function handleSetDay(list: RequestEntry[]) {
    if (!selectedDate) return
    const norm = normalizeRequests(list)
    setLocal(prev => {
      const next = new Map(prev)
      if (norm.length) next.set(selectedDate, norm); else next.delete(selectedDate)
      return next
    })
    setIsDirty(true)
    setSelectedDate(null)
  }

  function handleClear() {
    if (!selectedDate) return
    setLocal(prev => { const next = new Map(prev); next.delete(selectedDate); return next })
    setIsDirty(true)
    setSelectedDate(null)
  }

  function handleSubmitClick() {
    if (emptyDays.length > 0) setShowConfirm(true)
    else doSubmit()
  }

  function doSubmit() {
    setShowConfirm(false)
    startTransition(async () => {
      const entries = Array.from(local.entries()).flatMap(([date, list]) => list.map(e => ({
        date, type: e.type, start_time: e.start_time, end_time: e.end_time,
      })))
      const result = await saveAndSubmitRequests(month, entries)
      if (result.error) {
        toast.error(result.error)
      } else {
        setSubmittedAt(new Date().toISOString())
        setIsDirty(false)
        toast.success('希望を提出しました')
      }
    })
  }

  return (
    <div className="pb-[calc(env(safe-area-inset-bottom)+96px)]">
      {/* ─── ヘッダー ─── */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-hs-text-sub font-medium">
            希望入力 · 提出期限 {dlLabel}
            {extLabel && <span className="ml-1 text-orange-500 font-medium">{extLabel}</span>}
          </p>
          <h2 className="text-xl font-semibold text-hs-text mt-0.5">{cal.year}年{cal.mon}月</h2>
        </div>
        <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-chip border ${statusTag.cls}`}>
          {statusTag.text}
        </span>
      </div>

      {/* ─── 月の切り替え ─── */}
      {months.length > 1 && (
        <div className="px-4 pb-3 flex gap-1.5 overflow-x-auto">
          {months.map(m => {
            const active = m === month
            return (
              <a key={m} href={`/staff/requests?month=${m}`}
                className={`shrink-0 px-3 h-8 inline-flex items-center rounded-chip border text-sm
                  ${active ? 'bg-hs-blue text-white border-hs-blue' : 'bg-white text-hs-text-sub border-hs-border'}`}>
                {Number(m.slice(5))}月
              </a>
            )
          })}
        </div>
      )}

      {/* ─── 期限切れバナー ─── */}
      {isLocked && (
        <div className="mx-4 mb-3 rounded-btn border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          提出期限を過ぎたため変更できません。変更が必要な場合は、管理者に期限の延長を依頼してください。
        </div>
      )}

      {/* ─── カレンダー外枠 ─── */}
      <div className="border border-hs-border">

        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7">
          {DAY_NAMES.map((d, i) => (
            <div
              key={d}
              className={`py-1.5 text-center text-xs font-medium border-b border-r border-hs-border
                ${i === 0 ? 'text-hs-danger' : i === 6 ? 'text-hs-blue' : 'text-hs-text-sub'}`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* カレンダーグリッド */}
        <div className="grid grid-cols-7">
          {cal.cells.map((d, i) => {
            if (!d) {
              return <div key={`pad-${i}`} className="border-b border-r border-hs-border h-[72px]" />
            }
            const ds = dateStr(d)
            const list = local.get(ds) ?? []
            const isOff = list.some(e => e.type === 'off')
            const customs = list.filter(e => e.type === 'custom' && e.start_time && e.end_time)
            const dow = dowOfDay(d)
            const bg = isOff ? 'bg-[#fdf0e6]' : list.length ? 'bg-[#eaf4fd]' : 'bg-white'
            const dayColor = dow === 0 ? 'text-hs-danger' : dow === 6 ? 'text-hs-blue' : 'text-hs-text'

            return (
              <button
                key={ds}
                onClick={() => handleDayClick(d)}
                disabled={isLocked}
                className={`border-b border-r border-hs-border text-left pt-2 px-2 pb-1
                  h-[72px] overflow-hidden align-top
                  transition-colors active:opacity-70 ${bg}`}
              >
                <span className={`block text-xs font-medium leading-[1.25] ${dayColor}`}>{d}</span>
                {list.length > 0 && (
                  <div className="mt-1">
                    <span className={`block text-xs font-bold leading-[1.25] ${isOff ? 'text-orange-500' : 'text-hs-blue'}`}>
                      {requestText(list, { withTime: false })}
                    </span>
                    {customs.map(c => (
                      <span key={c.start_time} className="block text-[10px] font-medium text-hs-blue/60 leading-[1.25] mt-[2px] whitespace-nowrap overflow-hidden">
                        {fmtTimeRange(c.start_time!, c.end_time!)}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>

      </div>

      {/* ─── 件数 ─── */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-2 text-xs text-hs-text-sub">
        {(Object.entries(counts) as [RequestType, number][]).map(([type, n]) => (
          <span key={type}>{REQUEST_LABEL[type]} {n}</span>
        ))}
        <span>空欄 {emptyCount}</span>
      </div>

      {/* ─── 提出ボタン（fixed） ─── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-hs-border px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <button
          onClick={handleSubmitClick}
          disabled={isPending || isLocked}
          className="w-full min-h-tap bg-hs-blue hover:bg-hs-blue-hover text-white rounded-btn font-medium text-sm disabled:opacity-50 transition-colors"
        >
          {isPending ? '送信中...' : buttonLabel}
        </button>
      </div>

      {/* ─── 希望選択シート ─── */}
      <BottomSheet
        open={!!selectedDate}
        onClose={() => setSelectedDate(null)}
        subtitle={(() => {
          if (!selectedDate) return ''
          const d = new Date(selectedDate + 'T00:00:00')
          return `${d.getMonth() + 1}月${d.getDate()}日（${DAY_NAMES[d.getDay()]}）`
        })()}
        title="希望を選択（複数選べます）"
      >
        <WishPicker
          key={selectedDate ?? ''}
          current={selectedDate ? local.get(selectedDate) ?? [] : []}
          slotOptions={slotOptions}
          onDone={handleSetDay}
          onClear={handleClear}
        />
      </BottomSheet>

      {/* ─── 提出確認シート ─── */}
      <BottomSheet
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        subtitle="提出前の確認"
        title={`空欄が ${emptyDays.length}日 あります`}
      >
        <div className="space-y-4">
          <p className="text-sm text-hs-text leading-relaxed">
            空欄の日は「希望なし」として提出されます。勤務の可否は管理者が判断し、休みになる場合もあります。このまま提出してよいですか？
          </p>
          <div className="flex flex-wrap gap-2">
            {emptyDays.map(d => {
              const dow = dowOfDay(d)
              return (
                <button
                  key={d}
                  onClick={() => { setShowConfirm(false); setSelectedDate(dateStr(d)) }}
                  className="px-3 py-1.5 rounded-chip bg-hs-gray-light text-xs font-medium text-hs-text hover:bg-hs-blue-bg hover:text-hs-blue transition-colors"
                >
                  {d}日（{DAY_NAMES[dow]}）
                </button>
              )
            })}
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowConfirm(false)}
              className="flex-1 h-11 border border-hs-border rounded-btn text-sm font-medium text-hs-text"
            >
              戻って入力する
            </button>
            <button
              onClick={doSubmit}
              disabled={isPending}
              className="flex-1 h-11 bg-hs-blue hover:bg-hs-blue-hover text-white rounded-btn text-sm font-medium disabled:opacity-50"
            >
              空欄のまま提出
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}

// ─── WishPicker（複数選択）────────────────────────────────────────

function WishPicker({ current, slotOptions, onDone, onClear }: {
  current: RequestEntry[]
  slotOptions: SlotOption[]
  onDone: (list: RequestEntry[]) => void
  onClear: () => void
}) {
  const [picked, setPicked] = useState<Set<RequestType>>(
    () => new Set(current.filter(e => e.type !== 'custom' && e.type !== 'off').map(e => e.type)),
  )
  // 時間指定は2つまで（例：08:00-13:00 と 14:30-22:00）
  const [customs, setCustoms] = useState<{ start: string; end: string }[]>(
    () => current.filter(e => e.type === 'custom' && e.start_time && e.end_time)
      .map(e => ({ start: e.start_time!, end: e.end_time! })),
  )
  // 編集中の時間指定（-1 は追加）
  const [editing, setEditing] = useState<number | null>(null)

  if (editing !== null) {
    const base = editing >= 0 ? customs[editing] : null
    return (
      <TimePicker
        initialStart={base?.start ?? (customs.length ? '17:00:00' : '09:00:00')}
        initialEnd={base?.end ?? (customs.length ? '22:00:00' : '17:00:00')}
        onConfirm={(s, e) => {
          const next = editing >= 0 ? customs.map((c, i) => (i === editing ? { start: s, end: e } : c)) : [...customs, { start: s, end: e }]
          const msg = validateDayRequests(next.map(c => ({ type: 'custom' as RequestType, start_time: c.start, end_time: c.end })))
          if (msg) { toast.error(msg); return }
          setCustoms(next.sort((a, b) => a.start.localeCompare(b.start)))
          setEditing(null)
        }}
        onBack={() => setEditing(null)}
      />
    )
  }

  const toggle = (t: RequestType) => setPicked(prev => {
    const next = new Set(prev)
    if (next.has(t)) next.delete(t); else next.add(t)
    return next
  })

  const multi = slotOptions.filter(o => o.type !== 'custom' && o.type !== 'off')
  const hasAny = picked.size > 0 || customs.length > 0

  const done = () => onDone([
    ...Array.from(picked).map(type => ({ type })),
    ...customs.map(c => ({ type: 'custom' as RequestType, start_time: c.start, end_time: c.end })),
  ])

  return (
    <div className="space-y-4">
      <p className="text-xs text-hs-text-sub">入れる時間帯をすべて選んでください（例：朝と夜のどちらでも可なら両方）。時間指定は2つまで入れられます。</p>
      <div className="flex flex-wrap gap-2">
        {multi.map(({ type, label, timeLabel }) => {
          const on = picked.has(type)
          return (
            <button
              key={type}
              onClick={() => toggle(type)}
              aria-pressed={on}
              className={`flex flex-col items-center justify-center min-h-[64px] px-4 rounded-btn border-2 transition-colors min-w-[64px]
                ${on ? 'border-hs-blue bg-hs-blue-bg text-hs-blue' : 'border-hs-border text-hs-text hover:border-hs-blue hover:text-hs-blue'}`}
            >
              <span className="text-sm font-semibold">{on ? '✓ ' : ''}{label}</span>
              {timeLabel && <span className="text-[10px] text-hs-text-sub mt-0.5">{timeLabel}</span>}
            </button>
          )
        })}
        {customs.map((c, i) => (
          <span key={c.start} className="inline-flex items-center rounded-btn border-2 border-hs-blue bg-hs-blue-bg text-hs-blue">
            <button onClick={() => setEditing(i)} className="flex flex-col items-center justify-center min-h-[60px] px-3">
              <span className="text-sm font-semibold">✓ 時間{customs.length > 1 ? i + 1 : '指定'}</span>
              <span className="text-[10px] text-hs-text-sub mt-0.5">{fmtTimeRange(c.start, c.end)}</span>
            </button>
            <button onClick={() => setCustoms(prev => prev.filter((_, j) => j !== i))}
              className="h-full px-2 text-hs-text-lighter hover:text-hs-danger" aria-label="この時間指定を外す">×</button>
          </span>
        ))}
        {customs.length < MAX_TIME_RANGES && (
          <button
            onClick={() => setEditing(-1)}
            className="flex flex-col items-center justify-center min-h-[64px] px-4 rounded-btn border-2 border-dashed border-hs-border text-hs-text hover:border-hs-blue hover:text-hs-blue min-w-[64px]"
          >
            <span className="text-sm font-semibold">＋ 時間指定</span>
            {customs.length > 0 && <span className="text-[10px] text-hs-text-sub mt-0.5">2つ目</span>}
          </button>
        )}
      </div>

      <button
        onClick={done}
        disabled={!hasAny}
        className="w-full h-11 bg-hs-blue hover:bg-hs-blue-hover text-white rounded-btn text-sm font-medium disabled:opacity-40"
      >
        決定
      </button>

      <div className="flex gap-2">
        <button
          onClick={() => onDone([{ type: 'off' }])}
          className={`flex-1 h-11 rounded-btn text-sm font-medium border-2 transition-colors
            ${current.some(e => e.type === 'off') ? 'border-orange-400 bg-[#fdf0e6] text-orange-600' : 'border-hs-border text-orange-600'}`}
        >
          休み
        </button>
        {current.length > 0 && (
          <button
            onClick={onClear}
            className="flex-1 h-11 border border-hs-border rounded-btn text-sm text-hs-text-sub hover:text-hs-danger hover:border-red-200 transition-colors"
          >
            クリア
          </button>
        )}
      </div>
    </div>
  )
}

// ─── TimePicker ──────────────────────────────────────────────────

type Step = 15 | 30

function makeTimeOptions(step: Step): string[] {
  const opts: string[] = []
  for (let m = 0; m < 24 * 60; m += step) {
    const h = Math.floor(m / 60)
    const min = m % 60
    opts.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`)
  }
  return opts
}

function durationLabel(start: string, end: string): string {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startMin = sh * 60 + sm
  let endMin = eh * 60 + em
  let cross = false
  if (endMin <= startMin) { endMin += 24 * 60; cross = true }
  const dur = endMin - startMin
  const h = Math.floor(dur / 60)
  const min = dur % 60
  const parts = [h > 0 ? `${h}時間` : '', min > 0 ? `${min}分` : ''].filter(Boolean).join('')
  return cross ? `${parts} · 日をまたぐ` : parts
}

function snapToOptions(time: string, opts: string[]): string {
  return opts.includes(time) ? time : (opts[18] ?? opts[0])  // デフォルト 09:00
}

function TimePicker({ initialStart, initialEnd, onConfirm, onBack }: {
  initialStart: string
  initialEnd: string
  onConfirm: (start: string, end: string) => void
  onBack: () => void
}) {
  const [step, setStep] = useState<Step>(30)
  const [startTime, setStartTime] = useState(initialStart)
  const [endTime, setEndTime] = useState(initialEnd)

  const opts = makeTimeOptions(step)
  const start = snapToOptions(startTime, opts)
  const end = snapToOptions(endTime, opts)

  return (
    <div className="space-y-4">
      {/* 刻み切り替え */}
      <div className="flex gap-2">
        {([15, 30] as Step[]).map(s => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className={`px-3 py-1 rounded-chip text-xs font-medium border transition-colors
              ${step === s ? 'bg-hs-blue text-white border-hs-blue' : 'border-hs-border text-hs-text-sub'}`}
          >
            {s}分刻み
          </button>
        ))}
      </div>

      {/* 開始・終了 */}
      <div className="grid grid-cols-2 gap-3">
        {([['開始', start, setStartTime], ['終了', end, setEndTime]] as const).map(([label, val, set]) => (
          <div key={label}>
            <p className="text-xs text-hs-text-sub mb-1">{label}</p>
            <select
              value={val}
              onChange={e => set(e.target.value)}
              className="w-full border border-hs-border rounded-btn px-2 py-2 text-sm text-hs-text"
            >
              {opts.map(t => <option key={t} value={t}>{t.slice(0, 5)}</option>)}
            </select>
          </div>
        ))}
      </div>

      {/* 時間表示 */}
      <p className="text-sm text-center text-hs-text-sub">{durationLabel(start, end)}</p>

      {/* ボタン */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 h-11 border border-hs-border rounded-btn text-sm text-hs-text-sub"
        >
          ← 戻る
        </button>
        <button
          onClick={() => onConfirm(start, end)}
          className="flex-1 h-11 bg-hs-blue hover:bg-hs-blue-hover text-white rounded-btn text-sm font-medium"
        >
          この時刻で決定
        </button>
      </div>
    </div>
  )
}
