import Link from 'next/link'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { fetchCost } from '@/app/actions/cost'
import { FACILITY_DEFAULT_WAGE, PAID_LEAVE_HOURS } from '@/lib/pay'
import { yen, cn, nextMonthJST } from '@/lib/utils'
import { CopyButton } from '@/components/admin/CopyButton'

const pad = (n: number) => String(n).padStart(2, '0')
const hours = (min: number) => `${(Math.round(min / 6) / 10).toLocaleString('ja-JP')}h`
/** コピー用の時間（「728.5」のような数字だけ） */
const hoursNum = (min: number) => String(Math.round(min / 6) / 10)
/** タブ区切りの表（スプレッドシートにそのまま貼れる） */
const tsv = (rows: (string | number)[][]) => rows.map(r => r.join('\t')).join('\n')

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
            <div className="flex items-start gap-2 bg-hs-blue-bg border border-hs-border rounded-btn px-4 py-3 text-sm text-hs-text-sub">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-hs-text-lighter" />
              <div>
                時給を個別に設定していない人は、勤務した施設の初期時給（東京 {yen(FACILITY_DEFAULT_WAGE.BHJ)}・京都 {yen(FACILITY_DEFAULT_WAGE.BHKK)}・名古屋 {yen(FACILITY_DEFAULT_WAGE.MAHNM)}）で計算しています：{data.missingWage.join('、')}
                <Link href="/admin/staff" className="ml-2 underline underline-offset-2">スタッフで個別に設定 →</Link>
              </div>
            </div>
          )}

          {/* 合計 */}
          <div className="bg-white rounded-card border border-hs-border p-5">
            <p className="text-xs text-hs-text-sub">{y}年{m}月 全施設の合計</p>
            <p className="flex items-center gap-1 mt-1">
              <span className="text-3xl font-semibold text-hs-text tabular-nums">{yen(data.total.total)}</span>
              <CopyButton text={String(data.total.total)} label="合計金額をコピー" />
            </p>
            <div className="flex gap-6 mt-3 text-sm text-hs-text-sub flex-wrap">
              <span>給与 <b className="font-medium text-hs-text tabular-nums">{yen(data.total.pay)}</b></span>
              <span>交通費 <b className="font-medium text-hs-text tabular-nums">{yen(data.total.transport)}</b></span>
              <span>シフト <b className="font-medium text-hs-text tabular-nums">{data.total.shifts}件</b></span>
              <span>実働 <b className="font-medium text-hs-text tabular-nums">{hours(data.total.minutes)}</b></span>
            </div>
          </div>

          {/* 施設別 */}
          <section>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="text-sm font-medium text-hs-text">施設別</h2>
              <CopyButton label="施設別の表をコピー（スプレッドシートに貼れます）" text={tsv([
                ['施設', '合計', '給与', '交通費', '人数', '実働(h)'],
                ...data.facilities.map(f => { const t = data.facilityTotals[f.id]; return [f.id, t.total, t.pay, t.transport, t.staff, hoursNum(t.minutes)] }),
                ['全施設', data.total.total, data.total.pay, data.total.transport, '', hoursNum(data.total.minutes)],
              ])}>施設別をコピー</CopyButton>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {data.facilities.map(f => {
                const t = data.facilityTotals[f.id]
                const active = facility === f.id
                return (
                  // 金額を選んでコピーできるよう、カード全体はリンクにしない（絞り込みは下のボタン）
                  <div key={f.id}
                    className={cn('bg-white rounded-card border p-4',
                      active ? 'border-hs-blue ring-1 ring-hs-blue' : 'border-hs-border')}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-hs-text">{f.id}</span>
                      <span className="text-xs text-hs-text-lighter">{t.staff}名 · {hours(t.minutes)}</span>
                    </div>
                    <p className="flex items-center gap-1 mt-2">
                      <span className="text-xl font-semibold text-hs-text tabular-nums">{yen(t.total)}</span>
                      <CopyButton text={String(t.total)} label={`${f.id}の合計をコピー`} />
                    </p>
                    <p className="text-xs text-hs-text-sub mt-1 tabular-nums">給与 {yen(t.pay)} · 交通費 {yen(t.transport)}</p>
                    <Link href={`/admin/cost?month=${month}${active ? '' : `&facility=${f.id}`}`}
                      className="mt-2 inline-block text-xs text-hs-blue hover:underline">
                      {active ? '絞り込みを解除' : 'スタッフ別を絞り込む'}
                    </Link>
                  </div>
                )
              })}
            </div>
          </section>

          {/* スタッフ別 */}
          <section>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="text-sm font-medium text-hs-text">スタッフ別{facility ? `（${facility}で勤務した人。金額は全施設の合計）` : ''}</h2>
              <CopyButton label="スタッフ別の表をコピー（スプレッドシートに貼れます）" text={tsv([
                ['スタッフ', '出勤(日)', '有給(日)', '実働(h)', 'うち深夜(h)', '時給', '給与', '交通費', '合計'],
                ...rows.map(r => [r.fullName, r.days, r.paidLeaveDays, hoursNum(r.minutes), hoursNum(r.lateMinutes),
                  r.usesDefaultWage ? '施設の初期値' : r.hourlyWage ?? 0, r.pay, r.transport, r.total]),
              ])}>表をコピー</CopyButton>
            </div>
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
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {r.days}日
                        {r.paidLeaveDays > 0 && <span className="block text-[11px] text-hs-text-lighter">有給 {r.paidLeaveDays}日（{yen(r.paidLeavePay)}）</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {hours(r.minutes)}
                        {r.lateMinutes > 0 && <span className="block text-[11px] text-hs-text-lighter">うち深夜 {hours(r.lateMinutes)}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {r.usesDefaultWage
                          ? <span className="text-hs-text-sub">施設の初期値</span>
                          : yen(r.hourlyWage ?? 0)}
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
            交通費は「1出勤あたり」なら出勤日数分、「月額」は1日以上出勤した月に計上。有給は1日あたり所定{PAID_LEAVE_HOURS}時間×時給で給与に含めます（交通費なし）。
            時給は個別設定がなければ、勤務した施設の地域の初期時給を使います。残業・休日割増・社会保険料は含みません。
          </p>
        </>
      )}
    </div>
  )
}
