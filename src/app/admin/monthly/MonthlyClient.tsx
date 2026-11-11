'use client'

import { useMemo, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { publishMonth, type MonthBoard, type BoardShift } from '@/app/actions/board'
import { KIND_SHORT, KIND_COLOR, hhmm } from '@/lib/shift-kinds'
import { coversSlot } from '@/lib/rules'
import { monthRange, weekday, WEEK_JA, cn } from '@/lib/utils'

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
  const shifts = isAll ? board.shifts : board.shifts.filter(s => s.facility_id === facility)

  // 行：シフト対象の人のうち、この施設の所属か、この月にこの施設で入っている人
  const withShift = new Set(shifts.map(s => s.staff_id))
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
    <div className="p-4 md:p-6 space-y-4">
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
      <div className="bg-white rounded-card border border-hs-border overflow-x-auto">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr className="bg-hs-gray-lighter">
              <th className="sticky left-0 z-10 bg-hs-gray-lighter text-left px-3 py-2 font-medium text-hs-text-sub border-b border-hs-border min-w-[120px]">スタッフ</th>
              {dates.map(d => {
                const wd = weekday(d)
                return (
                  <th key={d} className={cn('px-0.5 py-1 font-medium border-b border-l border-hs-border min-w-[34px]',
                    wd === 0 ? 'text-hs-danger' : wd === 6 ? 'text-hs-blue' : 'text-hs-text-sub')}>
                    <Link href={`/admin/daily?facility=${facility}&date=${d}`} className="block hover:underline">
                      <div>{Number(d.slice(8))}</div>
                      <div className="text-[10px]">{WEEK_JA[wd]}</div>
                    </Link>
                  </th>
                )
              })}
              <th className="px-2 py-2 font-medium text-hs-text-sub border-b border-l border-hs-border">日数</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => {
              const count = new Set(shifts.filter(x => x.staff_id === s.id).map(x => x.date)).size
              return (
                <tr key={s.id} className="hover:bg-hs-gray-lighter/60">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-b border-hs-border whitespace-nowrap text-hs-text">
                    {s.fullName}
                    {s.isAdmin && <span className="ml-1 text-[10px] text-hs-text-lighter">管理者</span>}
                  </td>
                  {dates.map(d => {
                    const list = cell.get(`${s.id}|${d}`) ?? []
                    return (
                      <td key={d} className="p-0.5 border-b border-l border-hs-border text-center align-middle">
                        <Link href={`/admin/daily?facility=${isAll && list[0] ? list[0].facility_id : facility}&date=${d}`}
                          className="block min-h-[28px] rounded hover:ring-1 hover:ring-hs-blue-border">
                          {list.map(x => (
                            <span key={x.id} title={`${x.facility_id} ${hhmm(x.start_time)}-${hhmm(x.end_time)}`}
                              className="block leading-[14px] py-px rounded text-[11px] font-medium text-white"
                              style={{ background: KIND_COLOR[x.kind] ?? '#888' }}>
                              {isAll ? `${x.facility_id.slice(0, 4)}` : ''}{KIND_SHORT[x.kind] ?? x.kind}
                            </span>
                          ))}
                        </Link>
                      </td>
                    )
                  })}
                  <td className="px-2 py-1.5 border-b border-l border-hs-border text-center tabular-nums text-hs-text">{count}</td>
                </tr>
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
        記号：{['morning', 'evening', 'both', 'night', 'base', 'custom'].map(k => (
          <span key={k} className="inline-flex items-center gap-1 mr-3">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: KIND_COLOR[k] }} />
            {KIND_SHORT[k]}={{ morning: '朝勤', evening: '夕勤', both: '朝夕通し', night: '夜勤', base: '基本', custom: '浮き' }[k]}
          </span>
        ))}
        日付やマスを押すと、その日の日次調整を開きます。
      </p>
    </div>
  )
}
