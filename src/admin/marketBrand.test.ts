import { describe, expect, it } from 'vitest'

import { brandOf, contrastRatio, MARKET_BRANDS, textOn } from '@/admin/marketBrand'

/** Every provider id the Market data screen can meet: the API's provider table and Raisin. */
const PROVIDERS = [
  'aib',
  'boi',
  'ptsb',
  'ebs',
  'bunq',
  'moco',
  'revolut',
  'an_post_money',
  'avant_money',
  'credit_union',
  'credit_union_mortgages',
  'haven',
  'ics_mortgages',
  'nua_money',
  'state_savings',
  'bankinter',
  'raisin_bank',
  'banca_cf',
  'nordax',
  'creditplus',
  'ibl_banca',
  'aareal',
  'raisin',
]

describe('the brand colours', () => {
  it('has one for every provider the screen can meet', () => {
    expect(Object.keys(MARKET_BRANDS).sort()).toEqual([...PROVIDERS].sort())
  })

  it.each(Object.entries(MARKET_BRANDS))('gives %s text that passes WCAG AA', (_, brand) => {
    expect(brand.bg).toMatch(/^#[0-9a-f]{6}$/)
    expect(brand.fg).toBe(textOn(brand.bg))
    expect(contrastRatio(brand.bg, brand.fg)).toBeGreaterThanOrEqual(4.5)
  })

  it('shares the Irish League of Credit Unions’ colours between the credit unions', () => {
    expect(brandOf('credit_union_mortgages')).toEqual(brandOf('credit_union'))
  })

  it('has none for an unknown provider', () => {
    expect(brandOf('kbc')).toBeNull()
    expect(brandOf('toString')).toBeNull()
  })
})

describe('the contrast helper', () => {
  it('measures WCAG 2 contrast', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
    expect(contrastRatio('#0000ff', '#fff')).toBeCloseTo(8.59, 2)
  })

  it('picks white or black, whichever reads better', () => {
    expect(textOn('#0000ff')).toBe('#fff')
    expect(textOn('#ffff00')).toBe('#000')
  })
})
