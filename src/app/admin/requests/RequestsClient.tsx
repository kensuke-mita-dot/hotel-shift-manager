'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { setRequestAsAdmin, type RequestBoard, type BoardRequest } from '@/app/actions/board'
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
}

const BUTTONS: RequestType[] = ['morning', 'evening', 'both', 'night', 'off', 'custom']

type Cell = { staffId: string; date: string }

export function RequestsClient({ board, facility }: { board: RequestBoard; facility: string }) {
  const router = useRouter()
  const { month } = board
  const [y, m] = month.split('-').map(Number)
  const { days } = monthRange(month)
  const dates = Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`)

  // 画面上の希望（保存は1マスずつ即時。表示は先に反映）
  const [reqs, setReqs] = useState<Map<string, BoardRequest>>(
    () => new Map(board.requests.map(r => [`${r.staff_id}|${r.date}`, r])),
  )
  const [selected, setSelected] = useState<Cell | null>(null)
  const [startT, setStartT] = useState('10:00')
  const [endT, setEndT] = useState('15:00')
  const [pending, start] = useTransition()

  const facilityName = new Map(board.facilities.map(f => [f.id, f.name]))
  const rows = facility === 'all'
    ? board.staff
    : board.staff.filter(s => s.facilityIds.includes(facility))
  const subBy = useMemo(() => new Map(board.submissions.map(s => [s.staff_id, s])), [board.submissions])
  const nameBy = useMemo(() => new Map(board.staff.map(s => [s.id, s.fullName])), [board.staff])

  const save = (cell: Cell, type: RequestType | null) => {
    const key = `${cell.staffId}|${cell.date}`
    const before = reqs.get(key)
    const next = new Map(reqs)
    if (type === null) next.delete(key)
    else next.set(key, {
      staff_id: cell.staffId, date: cell.date, type,
      start_time: type === 'custom' ? `${startT}:00` : null,
      end_time:   type === 'custom' ? `${endT}:00`   : null,
    })
    setReqs(next)

    start(async () => {
      const r = await setRequestAsAdmin({
        staffId: cell.staffId, date: cell.date, type,
        ...(type === 'custom' ? { start: startT, end: endT } : {}),
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

    // 次の日へ進める（続けて入力しやすく）
    const idx = dates.indexOf(cell.date)
    if (idx >= 0 && idx < dates.length - 1) setSelected({ staffId: cell.staffId, date: dates[idx + 1] })
    else setSelected(null)
  }

  const selReq = selected ? reqs.get(`${selected.staffId}|${selected.date}`) : undefined

  return (
    <div className="p-4 md:p-6 space-y-4 pb-48">
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

      <div className="bg-white rounded-card border border-hs-border overflow-x-auto">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr className="bg-hs-gray-lighter">
              <th className="sticky left-0 z-10 bg-hs-gray-lighter text-left px-3 py-2 font-medium text-hs-text-sub border-b border-hs-border min-w-[140px]">スタッフ</th>
              {dates.map(d => {
                const wd = weekday(d)
                return (
                  <th key={d} className={cn('px-0.5 py-1 font-medium border-b border-l border-hs-border min-w-[36px]',
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
                    <td colSpan={dates.length + 1} className="sticky left-0 bg-hs-gray-light px-3 py-1 text-[11px] font-semibold text-hs-text-sub border-b border-hs-border">
                      {group ? `${group}　${facilityName.get(group) ?? ''}` : '所属未設定'}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-b border-hs-border whitespace-nowrap">
                    <div className="text-hs-text">
                      {s.fullName}
                      {s.isAdmin && <span className="ml-1 text-[10px] text-hs-text-lighter">管理者</span>}
                    </div>
                    <div className={cn('text-[10px]', sub?.submitted_at ? 'text-green-700' : 'text-hs-text-lighter')}>
                      {sub?.submitted_at ? '本人提出済' : '本人未提出'}
                    </div>
                  </td>
                  {dates.map(d => {
                    const r = reqs.get(`${s.id}|${d}`)
                    const isSel = selected?.staffId === s.id && selected.date === d
                    return (
                      <td key={d} className="p-0.5 border-b border-l border-hs-border text-center">
                        <button
                          onClick={() => setSelected({ staffId: s.id, date: d })}
                          className={cn('w-full min-h-[32px] rounded text-[11px] font-medium leading-tight',
                            r ? TYPE_STYLE[r.type] : 'hover:bg-hs-gray-lighter text-hs-text-lighter',
                            isSel && 'ring-2 ring-hs-blue')}
                          title={r?.type === 'custom' && r.start_time ? `${hhmm(r.start_time)}-${hhmm(r.end_time!)}` : undefined}
                        >
                          {r ? REQUEST_LABEL[r.type] : '·'}
                          {r?.type === 'custom' && r.start_time && (
                            <span className="block text-[9px] font-normal">{hhmm(r.start_time)}-{hhmm(r.end_time!)}</span>
                          )}
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
                今：{selReq ? REQUEST_LABEL[selReq.type] : 'なし'}
              </span>
              {pending && <Loader2 className="w-4 h-4 animate-spin text-hs-text-lighter" />}
              <button onClick={() => setSelected(null)} className="ml-auto h-8 w-8 inline-flex items-center justify-center rounded hover:bg-hs-gray-lighter" aria-label="閉じる">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {BUTTONS.filter(t => t !== 'custom').map(t => (
                <button key={t} onClick={() => save(selected, t)}
                  className={cn('h-10 min-w-[56px] px-3 rounded-btn text-sm font-medium border border-transparent', TYPE_STYLE[t],
                    selReq?.type === t && 'ring-2 ring-hs-blue')}>
                  {REQUEST_LABEL[t]}
                </button>
              ))}
              <span className="inline-flex items-center gap-1 pl-2 border-l border-hs-border">
                <input type="time" value={startT} onChange={e => setStartT(e.target.value)} step={900}
                  className="h-10 px-2 rounded-btn border border-hs-input-border text-base md:text-sm" aria-label="開始" />
                <span className="text-hs-text-sub">〜</span>
                <input type="time" value={endT} onChange={e => setEndT(e.target.value)} step={900}
                  className="h-10 px-2 rounded-btn border border-hs-input-border text-base md:text-sm" aria-label="終了" />
                <button onClick={() => save(selected, 'custom')}
                  className={cn('h-10 px-3 rounded-btn text-sm font-medium', TYPE_STYLE.custom, selReq?.type === 'custom' && 'ring-2 ring-hs-blue')}>
                  時間指定
                </button>
              </span>
              <button onClick={() => save(selected, null)}
                className="h-10 px-3 rounded-btn text-sm text-hs-text-sub border border-hs-border bg-white ml-auto">
                消す
              </button>
            </div>
            <p className="text-[11px] text-hs-text-lighter mt-2">押すと保存して、次の日に進みます。</p>
          </div>
        </div>
      )}
    </div>
  )
}
