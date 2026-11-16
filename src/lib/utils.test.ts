import { describe, it, expect } from 'vitest'
import { parseFacilityParam, toggleFacilityParam, inFacilitySelection } from './utils'

describe('施設の複数選択', () => {
  it('all・未指定は全施設（空配列）', () => {
    expect(parseFacilityParam('all')).toEqual([])
    expect(parseFacilityParam(undefined)).toEqual([])
    expect(parseFacilityParam('BHJ,MAHT')).toEqual(['BHJ', 'MAHT'])
  })
  it('押すたびに足す／外す。全部外れたら全施設', () => {
    expect(toggleFacilityParam('all', 'BHJ')).toBe('BHJ')
    expect(toggleFacilityParam('BHJ', 'MAHT')).toBe('BHJ,MAHT')
    expect(toggleFacilityParam('BHJ,MAHT', 'BHJ')).toBe('MAHT')
    expect(toggleFacilityParam('MAHT', 'MAHT')).toBe('all')
    expect(toggleFacilityParam('BHJ,MAHT', 'all')).toBe('all')
  })
  it('全施設なら何でも含む', () => {
    expect(inFacilitySelection([], 'BHJ')).toBe(true)
    expect(inFacilitySelection(['BHJ'], 'MAHT')).toBe(false)
  })
})
