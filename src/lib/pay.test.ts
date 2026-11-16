import { describe, it, expect } from 'vitest'
import { wageAt } from './pay'

describe('時給', () => {
  it('未設定（null）は施設の初期時給', () => {
    expect(wageAt(null, 'BHJ')).toBe(1280)
    expect(wageAt(undefined, 'BHKK')).toBe(1180)
    expect(wageAt(null, 'MAHNM')).toBe(1195)
  })
  it('0 は 0円のまま', () => {
    expect(wageAt(0, 'BHJ')).toBe(0)
  })
  it('個別設定はどの施設でも優先', () => {
    expect(wageAt(1500, 'MAHNM')).toBe(1500)
  })
})
