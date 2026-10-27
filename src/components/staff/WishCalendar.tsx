'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { BottomSheet } from '@/components/layout/BottomSheet'
import { saveAndSubmitRequests } from '@/app/actions/requests'
import type { RequestType, ShiftRequest, FacilitySlot } from '@/types'
import { REQUEST_LABEL } from '@/types'
import { fmtTimeRange } from '@/lib/time'

// ─── Calendar constants (December 2026) ─────────────────────────

const YEAR = 2026
const MONTH = 12
const DAYS_IN_MONTH = 31
const FIRST_DOW = new Date(YEAR, MONTH - 1, 1).getDay()  // 2 = Tuesday
const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

const CALENDAR_CELLS: (number | null)[] = (() => {
  const cells: (number | null)[] = Array(FIRST_DOW).fill(null)
  for (let d = 1; d <= DAYS_IN_MONTH; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
})()

function dateStr(d: number) {
  return `${YEAR}-${String(MONTH).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function dowOfDay(d: number) {
  return (FIRST_DOW + d - 1) % 7
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
  initialRequests: ShiftRequest[]
  submittedAt: string | null
  extendedUntil: string | null
  primaryFacilitySlots: FacilitySlot[]
  availableSlotKeys: string[]
  deadlineDate: string
}

// ─── WishCalendar ────────────────────────────────────────────────

export function WishCalendar({
  initialRequests,
  submittedAt: initialSubmittedAt,
  extendedUntil,
  primaryFacilitySlots,
  availableSlotKeys,
  deadlineDate,
}: Props) {
  const [local, setLocal] = useState<Map<string, RequestEntry>>(() => {
    const m = new Map<string, RequestEntry>()
    for (const r of initialRequests) {
      m.set(r.date, { type: r.type, start_time: r.start_time, end_time: r.end_time })
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
  const dl = new Date(deadlineDate)
  const dlLabel = `${dl.getMonth() + 1}/${dl.getDate()}（${DAY_NAMES[dl.getDay()]}）`
  const extLabel = (() => {
    if (!extendedUntil) return null
    const ed = new Date(extendedUntil)
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
  Array.from(local.values()).forEach(e => { counts[e.type]++ })
  const emptyCount = DAYS_IN_MONTH - local.size
  const emptyDays = Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1).filter(d => !local.has(dateStr(d)))

  const buttonLabel = submittedAt ? '変更を保存して再提出' : '保存して提出'

  function handleDayClick(d: number) {
    if (isLocked) { toast.error('提出期限を過ぎたため変更できません。'); return }
    setSelectedDate(dateStr(d))
  }

  function handleSelect(type: RequestType, start_time?: string | null, end_time?: string | null) {
    if (!selectedDate) return
    setLocal(prev => new Map(prev).set(selectedDate, { type, start_time: start_time ?? null, end_time: end_time ?? null }))
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
      const entries = Array.from(local.entries()).map(([date, e]) => ({
        date, type: e.type, start_time: e.start_time, end_time: e.end_time,
      }))
      const result = await saveAndSubmitRequests(entries)
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
    <div className="pb-24">
      {/* ─── ヘッダー ─── */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-hs-text-sub font-medium">
            希望入力 · 提出期限 {dlLabel}
            {extLabel && <span className="ml-1 text-orange-500 font-medium">{extLabel}</span>}
          </p>
          <h2 className="text-xl font-semibold text-hs-text mt-0.5">2026年12月</h2>
        </div>
        <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-chip border ${statusTag.cls}`}>
          {statusTag.text}
        </span>
      </div>

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
          {CALENDAR_CELLS.map((d, i) => {
            if (!d) {
              return <div key={`pad-${i}`} className="border-b border-r border-hs-border h-[72px]" />
            }
            const ds = dateStr(d)
            const entry = local.get(ds)
            const dow = dowOfDay(d)
            const bg = entry?.type === 'off' ? 'bg-[#fdf0e6]' : entry ? 'bg-[#eaf4fd]' : 'bg-white'
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
                {entry && (
                  <div className="mt-1">
                    <span className={`block text-xs font-bold leading-[1.25] ${entry.type === 'off' ? 'text-orange-500' : 'text-hs-blue'}`}>
                      {REQUEST_LABEL[entry.type]}
                    </span>
                    {entry.type === 'custom' && entry.start_time && entry.end_time && (
                      <span className="block text-xs font-medium text-hs-blue/60 leading-[1.25] mt-[2px] whitespace-nowrap overflow-hidden">
                        {fmtTimeRange(entry.start_time, entry.end_time)}
                      </span>
                    )}
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
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-hs-border p-4">
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
        title="希望を選択（施設は管理者が決めます）"
      >
        <WishPicker
          currentEntry={selectedDate ? local.get(selectedDate) : undefined}
          slotOptions={slotOptions}
          onSelect={handleSelect}
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

// ─── WishPicker ──────────────────────────────────────────────────

function WishPicker({ currentEntry, slotOptions, onSelect, onClear }: {
  currentEntry?: RequestEntry
  slotOptions: SlotOption[]
  onSelect: (type: RequestType, start_time?: string | null, end_time?: string | null) => void
  onClear: () => void
}) {
  const [showTimePicker, setShowTimePicker] = useState(currentEntry?.type === 'custom')

  if (showTimePicker) {
    return (
      <TimePicker
        initialStart={currentEntry?.start_time ?? '09:00:00'}
        initialEnd={currentEntry?.end_time ?? '17:00:00'}
        onConfirm={(s, e) => onSelect('custom', s, e)}
        onBack={() => setShowTimePicker(false)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {slotOptions.map(({ type, label, timeLabel }) => {
          const isSelected = currentEntry?.type === type
          return (
            <button
              key={type}
              onClick={() => type === 'custom' ? setShowTimePicker(true) : onSelect(type)}
              className={`flex flex-col items-center justify-center min-h-[64px] px-4 rounded-btn border-2 transition-colors min-w-[64px]
                ${isSelected
                  ? 'border-hs-blue bg-hs-blue-bg text-hs-blue'
                  : 'border-hs-border text-hs-text hover:border-hs-blue hover:text-hs-blue'
                }`}
            >
              <span className="text-sm font-semibold">{label}</span>
              {timeLabel && <span className="text-[10px] text-hs-text-sub mt-0.5">{timeLabel}</span>}
            </button>
          )
        })}
      </div>

      {currentEntry && (
        <button
          onClick={onClear}
          className="w-full h-10 border border-hs-border rounded-btn text-sm text-hs-text-sub hover:text-hs-danger hover:border-red-200 transition-colors"
        >
          クリア
        </button>
      )}
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
