'use client'

import { Fragment, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Send, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { publishMonth, setCellShift, type MonthBoard, type BoardShift } from '@/app/actions/board'
import { KIND_SHORT, KIND_COLOR, KIND_CUSTOM, KIND_OFF, KIND_PAID, hhmm, boardRows, bothTimes, isWorkKind, kindLabel } from '@/lib/shift-kinds'
import { requestText } from '@/lib/requests'
import { coversSlot, runAllChecks } from '@/lib/rules'
import { monthRange, weekday, WEEK_JA, cn, mainFacility, addDays } from '@/lib/utils'

const pad = (n: number) => String(n).padStart(2, '0')

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`
}

function fmtAt(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function MonthlyClient({ board, facility }: { board: MonthBoard; facility: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const { month } = board
  const [y, m] = month.split('-').map(Number)
  const { days } = monthRange(month)
  const dates = Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`)

  const isAll = facility === 'all'
  // 施設を選んでいるときは、表のマスから直接シフトを入れられる
  const editable = !isAll

  // 画面上のシフト（保存は1マスずつ。表示は先に反映し、サーバーの最新が届いたら置き換え）
  const [allShifts, setAllShifts] = useState<BoardShift[]>(board.checkShifts)
  useEffect(() => { setAllShifts(board.checkShifts) }, [board.checkShifts])
  const monthShifts = allShifts.filter(s => s.date >= dates[0] && s.date <= dates[dates.length - 1])
  const shifts = isAll ? monthShifts : monthShifts.filter(s => s.facility_id === facility)

  // 希望（空いているマスに薄く表示）
  const reqBy = useMemo(() => {
    const m = new Map<string, MonthBoard['requests']>()
    for (const r of board.requests) {
      const k = `${r.staff_id}|${r.date}`
      m.set(k, [...(m.get(k) ?? []), r])
    }
    return m
  }, [board.requests])

  // 勤務間隔8時間未満・施設間の時間かぶり（赤枠で表示）
  const flagged = useMemo(() => {
    const vs = runAllChecks({ shifts: allShifts, slots: board.slots, requests: [], facilityDates: [] })
    const m = new Map<string, string>()
    for (const v of vs) {
      if (v.type !== 'interval' && v.type !== 'overlap') continue
      for (const id of v.shiftIds) m.set(id, m.has(id) ? `${m.get(id)}\n${v.message}` : v.message)
    }
    return m
  }, [allShifts, board.slots])

  // 入力パネル
  const [selected, setSelected] = useState<{ staffId: string; date: string } | null>(null)
  const [floatStart, setFloatStart] = useState('10:00')
  const [floatEnd, setFloatEnd] = useState('15:00')

  // 行：シフト対象の人のうち、この施設の所属か、この月にこの施設で入っている人
  const withShift = new Set(shifts.map(s => s.staff_id))
  const facilityName = new Map(board.facilities.map(f => [f.id, f.name]))
  const rows = board.staff.filter(s => isAll || s.facilityIds.includes(facility) || withShift.has(s.id))

  const cell = useMemo(() => {
    const map = new Map<string, BoardShift[]>()
    for (const s of shifts) {
      const k = `${s.staff_id}|${s.date}`
      map.set(k, [...(map.get(k) ?? []), s])
    }
    return map
  }, [shifts])

  const facilitySlots = isAll ? [] : board.slots.filter(s => s.facility_id === facility).sort((a, b) => a.sort - b.sort)
  const kindRows = boardRows(facilitySlots)

  const nameBy = useMemo(() => new Map(board.staff.map(s => [s.id, s.fullName])), [board.staff])

  const goNext = (cell: { staffId: string; date: string }) => {
    const idx = dates.indexOf(cell.date)
    setSelected(idx >= 0 && idx < dates.length - 1 ? { staffId: cell.staffId, date: dates[idx + 1] } : null)
  }

  /** 1マス分を保存して次の日へ（kind = null で外す） */
  const saveCell = (cell: { staffId: string; date: string }, kind: string | null) => {
    if (!editable) return
    let startT = '', endT = ''
    if (kind === KIND_CUSTOM) {
      if (floatStart === floatEnd) { toast.error('浮きの開始と終了が同じです'); return }
      startT = floatStart; endT = floatEnd
    } else if (kind === KIND_OFF || kind === KIND_PAID) {
      startT = '00:00'; endT = '00:00'
    } else if (kind === 'both') {
      const t = bothTimes(facilitySlots); if (!t) return
      startT = hhmm(t.start); endT = hhmm(t.end)
    } else if (kind) {
      const sl = facilitySlots.find(x => x.key === kind); if (!sl) return
      startT = hhmm(sl.start_time); endT = hhmm(sl.end_time)
    }

    const before = allShifts
    const others = allShifts.filter(x => !(x.staff_id === cell.staffId && x.date === cell.date && x.facility_id === facility))
    const next = kind === null ? others : [...others, {
      id: `tmp-${cell.staffId}-${cell.date}`, facility_id: facility, staff_id: cell.staffId, date: cell.date, kind,
      start_time: `${startT}:00`, end_time: `${endT}:00`,
      starts_at: `${cell.date}T${startT}:00`,
      ends_at: `${endT <= startT ? addDays(cell.date, 1) : cell.date}T${endT}:00`,
      status: 'draft' as const,
    }]
    setAllShifts(next)
    goNext(cell)

    start(async () => {
      const r = await setCellShift({
        facilityId: facility, date: cell.date, staffId: cell.staffId, kind,
        ...(kind === KIND_CUSTOM ? { start: startT, end: endT } : {}),
      })
      if (r.error) { toast.error(r.error); setAllShifts(before); return }
      router.refresh()
    })
  }

  const selShift = selected ? shifts.find(x => x.staff_id === selected.staffId && x.date === selected.date) : undefined
  const selReq = selected ? reqBy.get(`${selected.staffId}|${selected.date}`) ?? [] : []
  const selElsewhere = selected
    ? monthShifts.filter(x => x.staff_id === selected.staffId && x.date === selected.date && x.facility_id !== facility)
    : []

  const targets = isAll ? board.facilities.map(f => f.id) : [facility]
  const publishRows = board.publish.filter(p => targets.includes(p.facilityId))
  const pendingTotal = publishRows.reduce((a, p) => a + p.pendingChanges, 0)

  const publish = (ids: string[]) => {
    const label = ids.length === 1 ? ids[0] : '全施設'
    if (!confirm(`${label} の${m}月のシフトを公開しますか？\nスタッフの「確定シフト」に表示されます。`)) return
    start(async () => {
      const r = await publishMonth(ids, month)
      if (r.error) { toast.error(`公開に失敗: ${r.error}`); return }
      toast.success(`${label} の${m}月を公開しました（変更があったスタッフ ${r.changedStaff ?? 0}名）`)
      router.refresh()
    })
  }

  return (
    <div className={cn('px-4 py-4 md:px-10 md:py-6 space-y-4', editable && 'pb-48')}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <Link href={`/admin/monthly?facility=${facility}&month=${shiftMonth(month, -1)}`}
            className="h-10 w-10 inline-flex items-center justify-center rounded-btn border border-hs-border bg-white" aria-label="前の月">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-xl font-semibold text-hs-text min-w-[130px] text-center">{y}年{m}月</h1>
          <Link href={`/admin/monthly?facility=${facility}&month=${shiftMonth(month, 1)}`}
            className="h-10 w-10 inline-flex items-center justify-center rounded-btn border border-hs-border bg-white" aria-label="次の月">
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        <button onClick={() => publish(targets)} disabled={pending}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-btn bg-hs-blue hover:bg-hs-blue-hover text-white text-sm font-medium disabled:opacity-50">
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {isAll ? '全施設を公開' : `${facility}を公開`}
          {pendingTotal > 0 && <span className="ml-1 px-1.5 rounded bg-white/25 text-xs">未公開の変更 {pendingTotal}</span>}
        </button>
      </div>

      {/* 公開状況 */}
      <div className="flex flex-wrap gap-2">
        {publishRows.map(p => (
          <div key={p.facilityId} className="flex items-center gap-2 px-3 py-1.5 rounded-btn bg-white border border-hs-border text-xs">
            <span className="font-medium text-hs-text">{p.facilityId}</span>
            {p.publishedAt
              ? <span className="text-hs-text-sub">公開 {fmtAt(p.publishedAt)}</span>
              : <span className="text-hs-text-lighter">未公開</span>}
            {p.pendingChanges > 0 && <span className="text-hs-warn">未公開の変更 {p.pendingChanges}件</span>}
            {isAll && (
              <button onClick={() => publish([p.facilityId])} disabled={pending}
                className="ml-1 text-hs-blue underline disabled:opacity-50">公開</button>
            )}
          </div>
        ))}
      </div>

      {/* 表 */}
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
                    <Link href={`/admin/daily?facility=${facility}&date=${d}`} className="block hover:underline">
                      <div>{Number(d.slice(8))}</div>
                      <div className="text-[10px]">{WEEK_JA[wd]}</div>
                    </Link>
                  </th>
                )
              })}
              <th className="sticky top-0 z-20 bg-hs-gray-lighter px-2 py-2 font-medium text-hs-text-sub border-b border-l border-hs-border">日数</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => {
              const count = new Set(shifts.filter(x => x.staff_id === s.id && isWorkKind(x.kind)).map(x => x.date)).size
              const group = mainFacility(s)
              const newGroup = i === 0 || mainFacility(rows[i - 1]) !== group
              return (
                <Fragment key={s.id}>
                {newGroup && (
                  <tr>
                    <td colSpan={dates.length + 2} className="bg-hs-gray-light px-3 py-1 text-[11px] font-semibold text-hs-text-sub border-b border-hs-border">
                      <span className="sticky left-3">{group ? `${group}　${facilityName.get(group) ?? ''}` : '所属未設定'}</span>
                    </td>
                  </tr>
                )}
                <tr className="hover:bg-hs-gray-lighter/60">
                  <td className="sticky left-0 z-10 bg-white px-2.5 py-1.5 border-b border-hs-border whitespace-nowrap text-hs-text">
                    {s.fullName}
                    {s.isAdmin && <span className="ml-1 text-[10px] text-hs-text-lighter">管理者</span>}
                  </td>
                  {dates.map(d => {
                    const list = cell.get(`${s.id}|${d}`) ?? []
                    const req = reqBy.get(`${s.id}|${d}`) ?? []
                    const warn = list.map(x => flagged.get(x.id)).filter(Boolean).join('\n')
                    const isSel = selected?.staffId === s.id && selected.date === d
                    const chips = list.map(x => (
                      <span key={x.id} title={isWorkKind(x.kind) ? `${x.facility_id} ${hhmm(x.start_time)}-${hhmm(x.end_time)}` : `${x.facility_id} ${kindLabel(x.kind, [])}`}
                        className="block leading-[14px] py-px rounded text-[11px] font-medium text-white"
                        style={{ background: KIND_COLOR[x.kind] ?? '#888' }}>
                        {isAll ? `${x.facility_id.slice(0, 4)}` : ''}{KIND_SHORT[x.kind] ?? x.kind}
                      </span>
                    ))
                    const reqHint = list.length === 0 && req.length > 0 && (
                      <span className={cn('block text-[10px] leading-[14px]',
                        req.some(r => r.type === 'off') ? 'text-hs-danger/50' : 'text-hs-text-lighter')}>
                        {requestText(req, { withTime: false })}
                      </span>
                    )
                    const cls = cn('block w-full min-h-[28px] rounded',
                      warn ? 'ring-2 ring-hs-danger' : 'hover:ring-1 hover:ring-hs-blue-border',
                      isSel && 'ring-2 ring-hs-blue')
                    const title = [req.length ? `希望：${requestText(req)}` : '', warn].filter(Boolean).join('\n') || undefined
                    return (
                      <td key={d} className="p-0.5 border-b border-l border-hs-border text-center align-middle">
                        {editable ? (
                          <button onClick={() => setSelected({ staffId: s.id, date: d })} className={cls} title={title}>
                            {chips}{reqHint}
                          </button>
                        ) : (
                          <Link href={`/admin/daily?facility=${list[0] ? list[0].facility_id : facility}&date=${d}`}
                            className={cls} title={title}>
                            {chips}{reqHint}
                          </Link>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-2 py-1.5 border-b border-l border-hs-border text-center tabular-nums text-hs-text">{count}</td>
                </tr>
                </Fragment>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={dates.length + 2} className="px-4 py-8 text-center text-hs-text-lighter">
                対象のスタッフがいません。<Link href="/admin/staff" className="underline">スタッフ</Link>で所属施設を設定してください。
              </td></tr>
            )}
          </tbody>
          {facilitySlots.length > 0 && (
            <tfoot>
              {facilitySlots.map(slot => (
                <tr key={slot.key} className="bg-hs-gray-lighter">
                  <td className="sticky left-0 z-10 bg-hs-gray-lighter px-3 py-1 border-t border-hs-border whitespace-nowrap text-hs-text-sub">
                    {slot.key === 'base' ? '基本' : slot.label}の人数
                  </td>
                  {dates.map(d => {
                    const n = shifts.filter(x => x.date === d && coversSlot(x.kind, slot.key)).length
                    const short = n < slot.min_staff
                    return (
                      <td key={d} className={cn('px-0.5 py-1 border-t border-l border-hs-border text-center tabular-nums',
                        short ? 'bg-hs-danger-bg text-hs-danger font-semibold' : 'text-hs-text-sub')}>{n}</td>
                    )
                  })}
                  <td className="border-t border-l border-hs-border" />
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-xs text-hs-text-sub">
        記号：{['morning', 'evening', 'both', 'night', 'base', 'custom', 'off', 'paid_leave'].map(k => (
          <span key={k} className="inline-flex items-center gap-1 mr-3">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: KIND_COLOR[k] }} />
            {KIND_SHORT[k]}={{ morning: '朝勤', evening: '夕勤', both: '朝夕通し', night: '夜勤', base: '基本', custom: '浮き', off: '休み', paid_leave: '有給' }[k]}
          </span>
        ))}
        {editable
          ? 'マスを押すと、画面下からシフトを入れられます。薄い文字は本人の希望、赤枠は勤務間隔8時間未満などの注意です。日付を押すとその日の日次調整を開きます。'
          : '施設を選ぶと、表のマスから直接シフトを入れられます。日付やマスを押すと、その日の日次調整を開きます。'}
      </p>

      {/* 入力パネル（画面下に固定） */}
      {editable && selected && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-hs-border shadow-[0_-4px_16px_rgba(0,0,0,0.06)] px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-sm font-medium text-hs-text">
                {nameBy.get(selected.staffId)}　{Number(selected.date.slice(5, 7))}/{Number(selected.date.slice(8))}（{WEEK_JA[weekday(selected.date)]}）{facility}
              </span>
              <span className="text-xs text-hs-text-sub">
                今：{selShift ? (isWorkKind(selShift.kind) ? `${KIND_SHORT[selShift.kind] ?? selShift.kind} ${hhmm(selShift.start_time)}-${hhmm(selShift.end_time)}` : kindLabel(selShift.kind, [])) : 'なし'}
                {selReq.length > 0 && <>　希望：{requestText(selReq)}</>}
                {selElsewhere.length > 0 && <span className="text-hs-warn">　{selElsewhere.map(x => `${x.facility_id}${KIND_SHORT[x.kind] ?? ''}`).join('・')}に配置済</span>}
              </span>
              {pending && <Loader2 className="w-4 h-4 animate-spin text-hs-text-lighter" />}
              <button onClick={() => setSelected(null)} className="ml-auto h-8 w-8 inline-flex items-center justify-center rounded hover:bg-hs-gray-lighter" aria-label="閉じる">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {kindRows.filter(r => r.kind !== KIND_CUSTOM).map(r => (
                <button key={r.kind} onClick={() => saveCell(selected, r.kind)}
                  className={cn('h-10 min-w-[64px] px-3 rounded-btn text-sm font-medium text-white',
                    selShift?.kind === r.kind && 'ring-2 ring-offset-1 ring-hs-blue')}
                  style={{ background: KIND_COLOR[r.kind] ?? '#888' }}
                  title={r.start && r.end ? `${hhmm(r.start)}〜${hhmm(r.end)}` : undefined}>
                  {r.label.replace('（通し）', '')}
                  {r.start && r.end && <span className="ml-1 text-[10px] font-normal opacity-90">{hhmm(r.start)}-{hhmm(r.end)}</span>}
                </button>
              ))}
              <span className="inline-flex items-center gap-1 pl-2 border-l border-hs-border">
                <input type="time" value={floatStart} onChange={e => setFloatStart(e.target.value)} step={900}
                  className="h-10 px-2 rounded-btn border border-hs-input-border text-base md:text-sm" aria-label="浮きの開始" />
                <span className="text-hs-text-sub">〜</span>
                <input type="time" value={floatEnd} onChange={e => setFloatEnd(e.target.value)} step={900}
                  className="h-10 px-2 rounded-btn border border-hs-input-border text-base md:text-sm" aria-label="浮きの終了" />
                <button onClick={() => saveCell(selected, KIND_CUSTOM)}
                  className={cn('h-10 px-3 rounded-btn text-sm font-medium text-white', selShift?.kind === KIND_CUSTOM && 'ring-2 ring-offset-1 ring-hs-blue')}
                  style={{ background: KIND_COLOR.custom }}>
                  浮き
                </button>
              </span>
              <span className="inline-flex items-center gap-2 pl-2 border-l border-hs-border ml-auto">
                {[KIND_OFF, KIND_PAID].map(k => (
                  <button key={k} onClick={() => saveCell(selected, k)}
                    className={cn('h-10 min-w-[56px] px-3 rounded-btn text-sm font-medium text-white', selShift?.kind === k && 'ring-2 ring-offset-1 ring-hs-blue')}
                    style={{ background: KIND_COLOR[k] }}>
                    {kindLabel(k, [])}
                  </button>
                ))}
                <button onClick={() => saveCell(selected, null)} disabled={!selShift}
                  className="h-10 px-3 rounded-btn text-sm text-hs-text-sub border border-hs-border bg-white disabled:opacity-40">
                  外す
                </button>
              </span>
            </div>
            <p className="text-[11px] text-hs-text-lighter mt-2">押すとすぐ保存して次の日へ進みます（下書き。スタッフに見えるのは「公開」後）。</p>
          </div>
        </div>
      )}
    </div>
  )
}
