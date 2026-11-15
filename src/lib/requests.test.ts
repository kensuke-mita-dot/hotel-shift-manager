import { describe, it, expect } from 'vitest'
import { validateDayRequests, normalizeRequests, requestText } from './requests'

const c = (s: string, e: string) => ({ type: 'custom' as const, start_time: s, end_time: e })

describe('希望の入力チェック', () => {
  it('朝と夜の両方を入れられる', () => {
    expect(validateDayRequests([{ type: 'morning' }, { type: 'night' }])).toBeNull()
  })
  it('休はほかと同時に選べない', () => {
    expect(validateDayRequests([{ type: 'off' }, { type: 'morning' }])).not.toBeNull()
  })
  it('時間指定は2つまで・重ならなければOK', () => {
    expect(validateDayRequests([c('08:00', '13:00'), c('14:30', '22:00')])).toBeNull()
  })
  it('時間指定が3つはNG', () => {
    expect(validateDayRequests([c('06:00', '07:00'), c('08:00', '13:00'), c('14:30', '22:00')])).not.toBeNull()
  })
  it('時間指定が重なるとNG', () => {
    expect(validateDayRequests([c('08:00', '15:00'), c('14:30', '22:00')])).not.toBeNull()
  })
  it('表示は開始時刻順', () => {
    expect(requestText(normalizeRequests([c('14:30:00', '22:00:00'), c('08:00:00', '13:00:00')]))).toBe('08:00-13:00・14:30-22:00')
    expect(requestText([c('14:30:00', '22:00:00'), c('08:00:00', '13:00:00')], { withTime: false })).toBe('時間')
  })
})
