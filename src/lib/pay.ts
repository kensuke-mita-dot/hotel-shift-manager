// src/lib/pay.ts
// 人件費計算の設定（金額は税込・円）

/** 施設ごとの時給の初期値（地域別）。スタッフに個別の時給が設定されていればそちらを優先 */
export const FACILITY_DEFAULT_WAGE: Record<string, number> = {
  BHJ:   1280, // 東京都
  MAHT:  1280, // 東京都
  MAHB:  1280, // 東京都
  BHKK:  1180, // 京都市
  MAHNM: 1195, // 名古屋市
}

/** 施設の地域名（表示用） */
export const FACILITY_REGION: Record<string, string> = {
  BHJ: '東京', MAHT: '東京', MAHB: '東京', BHKK: '京都', MAHNM: '名古屋',
}

/** 有給1日あたりの所定時間（時間）。8時間拘束−休憩1時間＝7時間。有給の賃金＝所定時間×時給 */
export const PAID_LEAVE_HOURS = 7

export function defaultWage(facilityId: string | null | undefined): number {
  return (facilityId && FACILITY_DEFAULT_WAGE[facilityId]) || 0
}

/** その施設での時給：個別設定があればそれ、なければ施設の初期値 */
export function wageAt(staffWage: number | null | undefined, facilityId: string): number {
  return staffWage && staffWage > 0 ? staffWage : defaultWage(facilityId)
}
