import { describe, expect, it } from 'vitest'

import {
  brandOf,
  contrastRatio,
  MARKET_BRANDS,
  MONOGRAM_MIN_CONTRAST,
  textOn,
} from '@/admin/marketBrand'

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

  // The monogram is a logotype stand-in with the provider's name beside it in full contrast:
  // 3:1 is its floor, not WCAG AA for text (4.5:1). White wherever it reaches 3:1.
  it.each(Object.entries(MARKET_BRANDS))(
    'gives %s initials at 3:1 or better, white wherever white reaches it',
    (_, brand) => {
      expect(brand.bg).toMatch(/^#[0-9a-f]{6}$/)
      expect(brand.fg).toBe(textOn(brand.bg))
      expect(contrastRatio(brand.bg, brand.fg)).toBeGreaterThanOrEqual(MONOGRAM_MIN_CONTRAST)
      if (brand.fg === '#000') expect(contrastRatio(brand.bg, '#fff')).toBeLessThan(3)
    },
  )

  it('puts white on the brands that use it, as their own marks do', () => {
    for (const id of ['ptsb', 'ebs', 'bankinter', 'an_post_money', 'raisin', 'raisin_bank']) {
      expect(brandOf(id)?.fg).toBe('#fff')
    }
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

  it('prefers white at 3:1 or better, else black', () => {
    expect(MONOGRAM_MIN_CONTRAST).toBe(3)
    expect(textOn('#0000ff')).toBe('#fff')
    // White is 3.40:1 on PTSB's orange (black would be higher): white still wins.
    expect(textOn('#fc4c02')).toBe('#fff')
    expect(textOn('#ffff00')).toBe('#000')
    // Mint, 1.92:1 with white: black.
    expect(textOn('#2ed2ae')).toBe('#000')
  })
})
