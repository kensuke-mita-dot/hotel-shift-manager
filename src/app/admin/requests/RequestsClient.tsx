'use client'

import { Fragment, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { setDayRequestsAsAdmin, type RequestBoard, type BoardRequest } from '@/app/actions/board'
import { normalizeRequests, requestText, validateDayRequests, MAX_TIME_RANGES } from '@/lib/requests'
import { monthRange, weekday, WEEK_JA, cn, mainFacility } from '@/lib/utils'
import { hhmm } from '@/lib/shift-kinds'
import { REQUEST_LABEL } from '@/types'
import type { RequestType } from '@/types'

const pad = (n: number) => String(n).padStart(2, '0')

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`
}

const TYPE_STYLE: Record<RequestType, string> = {
  morning: 'bg-[#fdf3e1] text-[#a86b10]',
  evening: 'bg-[#e6f1fc] text-[#1f6fb5]',
  both:    'bg-[#fbe9dc] text-[#b0561c]',
  night:   'bg-[#ecebfa] text-[#4a3fb0]',
  custom:  'bg-hs-gray-light text-hs-text',
  off:     'bg-[#fdecec] text-hs-danger',
  paid_leave: 'bg-[#e3f4f1] text-[#1f7a6d]',
}

/** 複数選択できる希望（休は単独） */
const MULTI: RequestType[] = ['morning', 'evening', 'both', 'night']

type Cell = { staffId: string; date: string }

export function RequestsClient({ board, facility }: { board: RequestBoard; facility: string }) {
  const router = useRouter()
  const { month } = board
  const [y, m] = month.split('-').map(Number)
  const { days } = monthRange(month)
  const dates = Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`)

  // 画面上の希望（1日に複数可。保存は1マスずつ。表示は先に反映）
  const [reqs, setReqs] = useState<Map<string, BoardRequest[]>>(() => {
    const m = new Map<string, BoardRequest[]>()
    for (const r of board.requests) {
      const k = `${r.staff_id}|${r.date}`
      m.set(k, [...(m.get(k) ?? []), r])
    }
    return m
  })
  const [selected, setSelected] = useState<Cell | null>(null)
  // 選択中のマスの下書き（複数選択）
  const [draft, setDraft] = useState<Set<RequestType>>(new Set())
  // 時間指定（1日2つまで）。空配列なら時間指定なし
  const [times, setTimes] = useState<{ start: string; end: string }[]>([])
  const [pending, start] = useTransition()

  const facilityName = new Map(board.facilities.map(f => [f.id, f.name]))
  const rows = facility === 'all'
    ? board.staff
    : board.staff.filter(s => s.facilityIds.includes(facility))
  const subBy = useMemo(() => new Map(board.submissions.map(s => [s.staff_id, s])), [board.submissions])
  const nameBy = useMemo(() => new Map(board.staff.map(s => [s.id, s.fullName])), [board.staff])

  const selKey = selected ? `${selected.staffId}|${selected.date}` : null
  const selReqs = selKey ? (reqs.get(selKey) ?? []) : []

  // マスを選んだら、今の希望を下書きに読み込む
  useEffect(() => {
    if (!selKey) return
    const cur = reqs.get(selKey) ?? []
    setDraft(new Set(cur.filter(r => MULTI.includes(r.type)).map(r => r.type)))
    setTimes(cur.filter(r => r.type === 'custom' && r.start_time && r.end_time)
      .map(r => ({ start: r.start_time!.slice(0, 5), end: r.end_time!.slice(0, 5) })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey])

  const goNext = (cell: Cell) => {
    const idx = dates.indexOf(cell.date)
    if (idx >= 0 && idx < dates.length - 1) setSelected({ staffId: cell.staffId, date: dates[idx + 1] })
    else setSelected(null)
  }

  /** 1日分を保存して次の日へ */
  const save = (cell: Cell, items: BoardRequest[]) => {
    const key = `${cell.staffId}|${cell.date}`
    const before = reqs.get(key)
    const list = normalizeRequests(items)
    setReqs(prev => {
      const next = new Map(prev)
      if (list.length) next.set(key, list); else next.delete(key)
      return next
    })

    start(async () => {
      const r = await setDayRequestsAsAdmin({
        staffId: cell.staffId, date: cell.date,
        items: list.map(i => ({
          type: i.type,
          ...(i.type === 'custom' ? { start: i.start_time!.slice(0, 5), end: i.end_time!.slice(0, 5) } : {}),
        })),
      })
      if (r.error) {
        toast.error(r.error)
        setReqs(prev => {
          const back = new Map(prev)
          if (before) back.set(key, before); else back.delete(key)
          return back
        })
        return
      }
      router.refresh()
    })
    goNext(cell)
  }

  const item = (cell: Cell, type: RequestType, t?: { start: string; end: string }): BoardRequest => ({
    staff_id: cell.staffId, date: cell.date, type,
    start_time: type === 'custom' && t ? `${t.start}:00` : null,
    end_time:   type === 'custom' && t ? `${t.end}:00`   : null,
  })

  const saveDraft = (cell: Cell) => {
    const items = [
      ...Array.from(draft).map(t => item(cell, t)),
      ...times.map(t => item(cell, 'custom', t)),
    ]
    const msg = validateDayRequests(items)
    if (msg) { toast.error(msg); return }
    save(cell, items)
  }

  const setTime = (i: number, patch: Partial<{ start: string; end: string }>) =>
    setTimes(prev => prev.map((t, j) => (j === i ? { ...t, ...patch } : t)))

  const toggle = (t: RequestType) => setDraft(prev => {
    const next = new Set(prev)
    if (next.has(t)) next.delete(t); else next.add(t)
    return next
  })

  return (
    <div className="px-4 py-4 md:px-10 md:py-6 space-y-4 pb-48">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-hs-text">希望</h1>
          <p className="text-xs text-hs-text-sub mt-0.5">マスを押して希望を入れます。提出期限に関係なく、管理者はいつでも入力・変更できます。</p>
        </div>
        <div className="flex items-center gap-1">
          <Link href={`/admin/requests?facility=${facility}&month=${shiftMonth(month, -1)}`}
            className="h-10 w-10 inline-flex items-center justify-center rounded-btn border border-hs-border bg-white" aria-label="前の月">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <span className="font-medium min-w-[110px] text-center">{y}年{m}月</span>
          <Link href={`/admin/requests?facility=${facility}&month=${shiftMonth(month, 1)}`}
            className="h-10 w-10 inline-flex items-center justify-center rounded-btn border border-hs-border bg-white" aria-label="次の月">
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-card border border-hs-border overflow-auto max-h-[calc(100dvh-13rem)]">
        <table className="text-xs border-separate border-spacing-0 w-full">
          <thead>
            <tr className="bg-hs-gray-lighter">
              <th className="sticky top-0 left-0 z-30 bg-hs-gray-lighter text-left px-3 py-2 font-medium text-hs-text-sub border-b border-hs-border w-[96px] min-w-[96px]">スタッフ</th>
              {dates.map(d => {
                const wd = weekday(d)
                return (
                  <th key={d} className={cn('sticky top-0 z-20 bg-hs-gray-lighter px-0.5 py-1 font-medium border-b border-l border-hs-border min-w-[32px]',
                    wd === 0 ? 'text-hs-danger' : wd === 6 ? 'text-hs-blue' : 'text-hs-text-sub')}>
                    <div>{Number(d.slice(8))}</div>
                    <div className="text-[10px]">{WEEK_JA[wd]}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => {
              const sub = subBy.get(s.id)
              const group = mainFacility(s)
              const newGroup = i === 0 || mainFacility(rows[i - 1]) !== group
              return (
                <Fragment key={s.id}>
                {newGroup && (
                  <tr>
                    <td colSpan={dates.length + 1} className="bg-hs-gray-light px-3 py-1 text-[11px] font-semibold text-hs-text-sub border-b border-hs-border">
                      <span className="sticky left-3">{group ? `${group}　${facilityName.get(group) ?? ''}` : '所属未設定'}</span>
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="sticky left-0 z-10 bg-white px-2.5 py-1.5 border-b border-hs-border whitespace-nowrap">
                    <div className="text-hs-text">
                      {s.fullName}
                      {s.isAdmin && <span className="ml-1 text-[10px] text-hs-text-lighter">管理者</span>}
                    </div>
                    <div className={cn('text-[10px]', sub?.submitted_at ? 'text-green-700' : 'text-hs-text-lighter')}>
                      {sub?.submitted_at ? '提出済' : '未提出'}
                    </div>
                  </td>
                  {dates.map(d => {
                    const list = reqs.get(`${s.id}|${d}`) ?? []
                    const r = list.length === 1 ? list[0] : null
                    const isSel = selected?.staffId === s.id && selected.date === d
                    return (
                      <td key={d} className="p-0.5 border-b border-l border-hs-border text-center">
                        <button
                          onClick={() => setSelected({ staffId: s.id, date: d })}
                          className={cn('w-full min-h-[32px] rounded text-[11px] font-medium leading-tight',
                            r ? TYPE_STYLE[r.type] : list.length > 1 ? 'bg-[#eef3ea] text-[#3d6b2f]' : 'hover:bg-hs-gray-lighter text-hs-text-lighter',
                            isSel && 'ring-2 ring-hs-blue')}
                          title={list.length ? requestText(list) : undefined}
                        >
                          {list.length === 0 ? '·' : requestText(list, { withTime: false })}
                          {list.filter(x => x.type === 'custom' && x.start_time).map(x => (
                            <span key={x.start_time} className="block text-[9px] font-normal">{hhmm(x.start_time!)}-{hhmm(x.end_time!)}</span>
                          ))}
                        </button>
                      </td>
                    )
                  })}
                </tr>
                </Fragment>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={dates.length + 1} className="px-4 py-8 text-center text-hs-text-lighter">
                対象のスタッフがいません。<Link href="/admin/staff" className="underline">スタッフ</Link>で所属施設を設定してください。
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 入力パネル（画面下に固定） */}
      {selected && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-hs-border shadow-[0_-4px_16px_rgba(0,0,0,0.06)] px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-hs-text">
                {nameBy.get(selected.staffId)}　{Number(selected.date.slice(5, 7))}/{Number(selected.date.slice(8))}（{WEEK_JA[weekday(selected.date)]}）
              </span>
              <span className="text-xs text-hs-text-sub">
                今：{selReqs.length ? requestText(selReqs) : 'なし'}
              </span>
              {pending && <Loader2 className="w-4 h-4 animate-spin text-hs-text-lighter" />}
              <button onClick={() => setSelected(null)} className="ml-auto h-8 w-8 inline-flex items-center justify-center rounded hover:bg-hs-gray-lighter" aria-label="閉じる">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {MULTI.map(t => (
                <button key={t} onClick={() => toggle(t)} aria-pressed={draft.has(t)}
                  className={cn('h-10 min-w-[56px] px-3 rounded-btn text-sm font-medium border-2',
                    draft.has(t) ? `${TYPE_STYLE[t]} border-hs-blue` : 'bg-white text-hs-text-sub border-hs-border')}>
                  {draft.has(t) ? '✓ ' : ''}{REQUEST_LABEL[t]}
                </button>
              ))}
              <span className="inline-flex flex-wrap items-center gap-1.5 pl-2 border-l border-hs-border">
                {times.map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-1 pl-2 pr-1 h-10 rounded-btn border-2 border-hs-blue bg-hs-gray-light">
                    <span className="text-xs font-medium text-hs-text">時間{times.length > 1 ? i + 1 : ''}</span>
                    <input type="time" value={t.start} onChange={e => setTime(i, { start: e.target.value })} step={900}
                      className="h-8 px-1.5 rounded border border-hs-input-border bg-white text-base md:text-sm" aria-label={`時間指定${i + 1}の開始`} />
                    <span className="text-hs-text-sub">〜</span>
                    <input type="time" value={t.end} onChange={e => setTime(i, { end: e.target.value })} step={900}
                      className="h-8 px-1.5 rounded border border-hs-input-border bg-white text-base md:text-sm" aria-label={`時間指定${i + 1}の終了`} />
                    <button onClick={() => setTimes(prev => prev.filter((_, j) => j !== i))}
                      className="h-7 w-7 inline-flex items-center justify-center rounded text-hs-text-lighter hover:text-hs-danger" aria-label="この時間指定を外す">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
                {times.length < MAX_TIME_RANGES && (
                  <button
                    onClick={() => setTimes(prev => [...prev, prev.length === 0 ? { start: '10:00', end: '15:00' } : { start: '17:00', end: '22:00' }])}
                    className="h-10 px-3 rounded-btn text-sm font-medium border-2 border-dashed border-hs-border bg-white text-hs-text-sub hover:border-hs-blue hover:text-hs-blue">
                    ＋ 時間指定{times.length > 0 ? '（2つ目）' : ''}
                  </button>
                )}
              </span>
              <button onClick={() => saveDraft(selected)} disabled={draft.size === 0 && times.length === 0}
                className="h-10 px-4 rounded-btn bg-hs-blue hover:bg-hs-blue-hover text-white text-sm font-medium disabled:opacity-40">
                決定して次の日へ
              </button>
              <span className="inline-flex items-center gap-2 pl-2 border-l border-hs-border ml-auto">
                <button onClick={() => save(selected, [item(selected, 'off')])} title="入れない"
                  className={cn('h-10 min-w-[56px] px-3 rounded-btn text-sm font-medium', TYPE_STYLE.off,
                    selReqs.some(r => r.type === 'off') && 'ring-2 ring-hs-blue')}>
                  ×
                </button>
                <button onClick={() => save(selected, [item(selected, 'paid_leave')])}
                  className={cn('h-10 min-w-[56px] px-3 rounded-btn text-sm font-medium', TYPE_STYLE.paid_leave,
                    selReqs.some(r => r.type === 'paid_leave') && 'ring-2 ring-hs-blue')}>
                  有給
                </button>
                <button onClick={() => save(selected, [])}
                  className="h-10 px-3 rounded-btn text-sm text-hs-text-sub border border-hs-border bg-white">
                  消す
                </button>
              </span>
            </div>
            <p className="text-[11px] text-hs-text-lighter mt-2">朝・夕・朝夕・夜は複数選べます（例：朝と夜のどちらでも可）。時間指定は2つまで（例：8:00〜13:00と14:30〜22:00）。「×（入れない）」「有給」「消す」は押すとすぐ保存して次の日へ進みます。</p>
          </div>
        </div>
      )}
    </div>
  )
}
