import Link from 'next/link'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { fetchCost } from '@/app/actions/cost'
import { yen, cn, nextMonthJST } from '@/lib/utils'

const pad = (n: number) => String(n).padStart(2, '0')
const hours = (min: number) => `${(Math.round(min / 6) / 10).toLocaleString('ja-JP')}h`

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`
}

export default async function CostPage({
  searchParams,
}: {
  searchParams: { month?: string; facility?: string }
}) {
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? '') ? searchParams.month! : nextMonthJST()
  const facility = searchParams.facility && searchParams.facility !== 'all' ? searchParams.facility : null
  const [y, m] = month.split('-').map(Number)
  const data = await fetchCost(month)

  const rows = facility ? data.rows.filter(r => r.byFacility[facility]) : data.rows
  const fq = facility ? `&facility=${facility}` : ''

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-hs-text">人件費見込み</h1>
          <p className="text-xs text-hs-text-sub mt-0.5">日次調整で入れたシフト（未公開の下書きを含む）× スタッフの時給・交通費</p>
        </div>
        <div className="flex items-center gap-1">
          <Link href={`/admin/cost?month=${shiftMonth(month, -1)}${fq}`} className="h-10 w-10 inline-flex items-center justify-center rounded-btn border border-hs-border bg-white" aria-label="前の月">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <span className="font-medium min-w-[110px] text-center">{y}年{m}月</span>
          <Link href={`/admin/cost?month=${shiftMonth(month, 1)}${fq}`} className="h-10 w-10 inline-flex items-center justify-center rounded-btn border border-hs-border bg-white" aria-label="次の月">
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {data.error ? (
        <div className="bg-hs-danger-bg border border-hs-danger-border rounded-card p-4 text-sm text-hs-danger">{data.error}</div>
      ) : (
        <>
          {data.missingWage.length > 0 && (
            <div className="flex items-start gap-2 bg-hs-warn-bg border border-hs-warn/30 rounded-btn px-4 py-3 text-sm text-hs-warn">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                時給が未設定の人がいます（0円で計算中）：{data.missingWage.join('、')}
                <Link href="/admin/staff" className="ml-2 underline underline-offset-2">スタッフで設定 →</Link>
              </div>
            </div>
          )}

          {/* 合計 */}
          <div className="bg-white rounded-card border border-hs-border p-5">
            <p className="text-xs text-hs-text-sub">{y}年{m}月 全施設の合計</p>
            <p className="text-3xl font-semibold text-hs-text mt-1 tabular-nums">{yen(data.total.total)}</p>
            <div className="flex gap-6 mt-3 text-sm text-hs-text-sub flex-wrap">
              <span>給与 <b className="font-medium text-hs-text tabular-nums">{yen(data.total.pay)}</b></span>
              <span>交通費 <b className="font-medium text-hs-text tabular-nums">{yen(data.total.transport)}</b></span>
              <span>シフト <b className="font-medium text-hs-text tabular-nums">{data.total.shifts}件</b></span>
              <span>実働 <b className="font-medium text-hs-text tabular-nums">{hours(data.total.minutes)}</b></span>
            </div>
          </div>

          {/* 施設別 */}
          <section>
            <h2 className="text-sm font-medium text-hs-text mb-2">施設別（押すとスタッフ別をその施設で絞り込み）</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {data.facilities.map(f => {
                const t = data.facilityTotals[f.id]
                const active = facility === f.id
                return (
                  <Link key={f.id} href={`/admin/cost?month=${month}${active ? '' : `&facility=${f.id}`}`}
                    className={cn('bg-white rounded-card border p-4 block hover:border-hs-blue-border',
                      active ? 'border-hs-blue ring-1 ring-hs-blue' : 'border-hs-border')}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-hs-text">{f.id}</span>
                      <span className="text-xs text-hs-text-lighter">{t.staff}名 · {hours(t.minutes)}</span>
                    </div>
                    <p className="text-xl font-semibold text-hs-text mt-2 tabular-nums">{yen(t.total)}</p>
                    <p className="text-xs text-hs-text-sub mt-1 tabular-nums">給与 {yen(t.pay)} · 交通費 {yen(t.transport)}</p>
                  </Link>
                )
              })}
            </div>
          </section>

          {/* スタッフ別 */}
          <section>
            <h2 className="text-sm font-medium text-hs-text mb-2">スタッフ別{facility ? `（${facility}で勤務した人。金額は全施設の合計）` : ''}</h2>
            <div className="bg-white rounded-card border border-hs-border overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="border-b border-hs-border bg-hs-gray-lighter text-xs text-hs-text-sub">
                    <th className="text-left  px-4 py-3 font-medium">スタッフ</th>
                    <th className="text-left  px-3 py-3 font-medium">施設ごとの勤務</th>
                    <th className="text-right px-3 py-3 font-medium">出勤</th>
                    <th className="text-right px-3 py-3 font-medium">実働</th>
                    <th className="text-right px-3 py-3 font-medium">時給</th>
                    <th className="text-right px-3 py-3 font-medium">給与</th>
                    <th className="text-right px-3 py-3 font-medium">交通費</th>
                    <th className="text-right px-4 py-3 font-medium">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.staffId} className="border-b border-hs-border last:border-0">
                      <td className="px-4 py-2.5 font-medium text-hs-text">{r.fullName}</td>
                      <td className="px-3 py-2.5 text-xs text-hs-text-sub">
                        {Object.entries(r.byFacility).map(([fid, b]) => `${fid} ${b.shifts}回`).join(' / ')}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.days}日</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {hours(r.minutes)}
                        {r.lateMinutes > 0 && <span className="block text-[11px] text-hs-text-lighter">うち深夜 {hours(r.lateMinutes)}</span>}
                      </td>
                      <td className={cn('px-3 py-2.5 text-right tabular-nums', r.hourlyWage === 0 && 'text-hs-warn')}>
                        {r.hourlyWage === 0 ? '未設定' : yen(r.hourlyWage)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{yen(r.pay)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {yen(r.transport)}
                        <span className="block text-[11px] text-hs-text-lighter">
                          {r.transportType === 'monthly' ? '月額' : `1出勤 ${yen(r.transportAmount)}`}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-hs-text">{yen(r.total)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-hs-text-lighter">この月のシフトはまだありません</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-xs text-hs-text-lighter leading-relaxed">
            計算の前提：実働＝勤務時間から休憩（6時間超は45分、8時間超は60分）を引いたもの。
            22時〜翌5時の勤務に深夜割増25%を加算（休憩は深夜帯以外で取る前提）。
            交通費は「1出勤あたり」なら出勤日数分、「月額」は1日以上出勤した月に計上。残業・休日割増・社会保険料は含みません。
          </p>
        </>
      )}
    </div>
  )
}
