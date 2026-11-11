import Link from 'next/link'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { fetchCostData } from '@/app/actions/cost'
import { todayJST, yen } from '@/lib/utils'
import { SLOT_HOURS, LATE_NIGHT_PREMIUM } from '@/types'

const rate = (matched: number, wished: number) =>
  wished === 0 ? '—' : `${Math.round((matched / wished) * 100)}%`

const hoursLabel = (h: number) => `${h.toLocaleString('ja-JP')}h`

export default async function CostPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string }
}) {
  const [ty, tm] = todayJST().split('-').map(Number)
  const qy = parseInt(searchParams.year  ?? '')
  const qm = parseInt(searchParams.month ?? '')
  const year  = Number.isFinite(qy) ? qy : ty
  const month = Number.isFinite(qm) && qm >= 1 && qm <= 12 ? qm : tm

  const prev = month === 1  ? { y: year - 1, m: 12 } : { y: year, m: month - 1 }
  const next = month === 12 ? { y: year + 1, m: 1 }  : { y: year, m: month + 1 }

  const data = await fetchCostData(year, month)

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">

        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">人件費見込み</h1>
            <p className="text-sm text-gray-500 mt-0.5">保存済みシフト × スタッフ設定の時給・交通費で計算</p>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href={`/admin/cost?year=${prev.y}&month=${prev.m}`}
              className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white hover:bg-gray-50"
              aria-label="前の月"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <span className="text-base font-medium min-w-[110px] text-center">{year}年{month}月</span>
            <Link
              href={`/admin/cost?year=${next.y}&month=${next.m}`}
              className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white hover:bg-gray-50"
              aria-label="次の月"
            >
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {data.error ? (
          <div className="bg-white border border-red-200 rounded-xl p-6 text-red-700 text-sm">
            <p className="font-medium mb-1">データ取得エラー</p>
            <p>{data.error}</p>
          </div>
        ) : (
          <div className="space-y-5">

            {/* 時給未設定の警告 */}
            {data.missingWage.length > 0 && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  時給が未設定のスタッフがいます（0円で計算中）：{data.missingWage.join('、')}
                  <Link href="/admin/staff" className="ml-2 underline underline-offset-2">スタッフ設定を開く →</Link>
                </div>
              </div>
            )}

            {/* 全体合計 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500">{year}年{month}月 人件費見込み（全スタッフ合計）</p>
              <p className="text-3xl font-semibold text-gray-900 mt-1 tabular-nums">{yen(data.total.total)}</p>
              <div className="flex gap-6 mt-3 text-sm text-gray-600 flex-wrap">
                <span>給与 <b className="font-medium text-gray-900 tabular-nums">{yen(data.total.pay)}</b></span>
                <span>交通費 <b className="font-medium text-gray-900 tabular-nums">{yen(data.total.transport)}</b></span>
                <span>延べ出勤 <b className="font-medium text-gray-900 tabular-nums">{data.total.days}日</b></span>
                <span>労働時間 <b className="font-medium text-gray-900 tabular-nums">{hoursLabel(data.total.hours)}</b></span>
              </div>
            </div>

            {/* 施設別 */}
            <section>
              <h2 className="text-sm font-medium text-gray-700 mb-2">施設別</h2>
              {data.facilities.length === 0 ? (
                <p className="text-sm text-gray-400">スタッフが登録されていません</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.facilities.map(f => (
                    <div key={f.code} className="bg-white rounded-xl border border-gray-200 p-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-gray-900">{f.code}</span>
                        <span className="text-xs text-gray-400">{f.staffN}名 · {hoursLabel(f.hours)}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{f.name}</p>
                      <p className="text-xl font-semibold text-gray-900 mt-2 tabular-nums">{yen(f.total)}</p>
                      <p className="text-xs text-gray-500 mt-1 tabular-nums">
                        給与 {yen(f.pay)} · 交通費 {yen(f.transport)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        希望採用率 {rate(f.matchedDays, f.wishedDays)}
                        <span className="text-gray-400">（{f.matchedDays}/{f.wishedDays}日）</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* スタッフ別 */}
            <section>
              <h2 className="text-sm font-medium text-gray-700 mb-2">スタッフ別</h2>
              <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm min-w-[820px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                      <th className="text-left  px-4 py-3 font-medium">スタッフ</th>
                      <th className="text-left  px-3 py-3 font-medium">施設</th>
                      <th className="text-right px-3 py-3 font-medium">出勤</th>
                      <th className="text-right px-3 py-3 font-medium">時間</th>
                      <th className="text-right px-3 py-3 font-medium">時給</th>
                      <th className="text-right px-3 py-3 font-medium">給与</th>
                      <th className="text-right px-3 py-3 font-medium">交通費</th>
                      <th className="text-right px-3 py-3 font-medium">合計</th>
                      <th className="text-right px-4 py-3 font-medium">希望採用率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.staff.map(s => (
                      <tr key={s.staffId} className="border-b border-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-800">{s.fullName}</td>
                        <td className="px-3 py-2.5 text-gray-500">{s.facility ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{s.days}日</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {hoursLabel(s.hours)}
                          {s.lateNightHours > 0 && (
                            <span className="block text-[11px] text-gray-400">うち深夜 {s.lateNightHours}h</span>
                          )}
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${s.hourlyWage === 0 ? 'text-amber-600' : ''}`}>
                          {s.hourlyWage === 0 ? '未設定' : yen(s.hourlyWage)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{yen(s.pay)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {yen(s.transport)}
                          <span className="block text-[11px] text-gray-400">
                            {s.transportType === 'monthly' ? '月額' : `1出勤 ${yen(s.transportAmount)}`}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium text-gray-900">{yen(s.total)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {rate(s.matchedDays, s.wishedDays)}
                          <span className="block text-[11px] text-gray-400">
                            {s.matchedDays}/{s.wishedDays}日
                            {s.offWorkDays > 0 && <span className="text-red-500"> · 休希望日に出勤 {s.offWorkDays}日</span>}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {data.staff.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-gray-400">スタッフが登録されていません</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 計算の前提 */}
            <p className="text-xs text-gray-400 leading-relaxed">
              計算の前提：実働 朝勤{SLOT_HOURS.morning.paid}h・夕勤{SLOT_HOURS.evening.paid}h・夜勤{SLOT_HOURS.night.paid}h（各休憩1h控除）。
              夜勤のうち{SLOT_HOURS.night.lateNight}hに深夜割増{Math.round(LATE_NIGHT_PREMIUM * 100)}%を加算。
              月額の交通費は1日以上出勤した月に計上。残業・休日割増・社会保険料は含みません。
              希望採用率＝希望どおりのスロットに入った日数 ÷ 出勤を希望した日数。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
