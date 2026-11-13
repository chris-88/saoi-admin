import { describe, expect, it } from 'vitest'
import type { MarketProductVersion } from '@contracts/market.ts'
import { adminMarketViewsSchema } from '@contracts/market.ts'
import { groupVersions } from './marketFormat'
import { MARKET_LOGOS } from './marketLogos'
import {
  accountKindOf,
  ANY_TERM,
  findRawGroup,
  logoOf,
  matchesFilters,
  monogram,
  monthsLabel,
  providerGroups,
  providerLabel,
  shortTerm,
  sortViews,
  termBucketOf,
  termFromBuckets,
  termFromSpan,
  termSpan,
  termStops,
  termSummary,
  type MarketView,
} from './marketViews'

const view: MarketView = {
  id: 'boi:deposits.ladder_fixed_term',
  provider: 'boi',
  providerName: 'Bank of Ireland',
  platform: null,
  providerDomain: 'bankofireland.com',
  category: 'deposits',
  categoryLabel: 'Deposits',
  name: 'Fixed Term Deposit',
  headline: { ratePct: 2.48, label: '2.48% AER' },
  termMonths: null,
  termLabel: null,
  ladder: [
    { months: 6, ratePct: 2 },
    { months: 18, ratePct: 2.48 },
  ],
  access: null,
  lines: [],
  conditions: [],
  unknown: [],
  checkedAt: '2026-11-12T00:00:00.000Z',
  lastChangedAt: null,
  stale: false,
  retired: false,
  sources: [{ source: 'ccpc', rowId: 'boi:deposit.c6', url: null, checkedAt: '2026-11-12' }],
}

const none = {
  sources: [],
  providers: [],
  categories: [],
  term: ANY_TERM,
  rate: { min: null, max: null },
}

describe('the market views contract', () => {
  it('parses the agreed shape and refuses a category it does not know', () => {
    expect(adminMarketViewsSchema.parse({ asOf: '2026-11-13', views: [view] }).views).toHaveLength(
      1,
    )
    expect(() =>
      adminMarketViewsSchema.parse({
        asOf: '2026-11-13',
        views: [{ ...view, platform: 'Lightyear' }],
      }),
    ).toThrow()
    expect(() =>
      adminMarketViewsSchema.parse({
        asOf: '2026-11-13',
        views: [{ ...view, category: 'deposit' }],
      }),
    ).toThrow()
  })
})

describe('the term buckets', () => {
  it('puts every month count in one bucket, at the edges too', () => {
    expect(
      [1, 6, 7, 12, 13, 24, 25, 36, 37, 48, 60, 61, 300, null].map((m) => termBucketOf(m)),
    ).toEqual([
      'up_to_6',
      'up_to_6',
      '7_to_12',
      '7_to_12',
      '13_to_24',
      '13_to_24',
      '2_to_3_years',
      '2_to_3_years',
      '4_to_5_years',
      '4_to_5_years',
      '4_to_5_years',
      'over_5_years',
      'over_5_years',
      'none',
    ])
  })

  it('matches a ladder on any of its terms, and passes categories without a term', () => {
    expect(matchesFilters(view, { ...none, term: termFromBuckets(['13_to_24']) })).toBe(true)
    expect(matchesFilters(view, { ...none, term: termFromBuckets(['7_to_12']) })).toBe(false)
    expect(matchesFilters(view, { ...none, term: termFromBuckets(['none']) })).toBe(false)
    const card = { ...view, category: 'credit_cards' as const, ladder: [] }
    expect(matchesFilters(card, { ...none, term: termFromBuckets(['7_to_12']) })).toBe(true)
    const variable = { ...view, category: 'mortgages' as const, ladder: [] }
    expect(matchesFilters(variable, { ...none, term: termFromBuckets(['none']) })).toBe(true)
  })

  it('writes a term short, and in words', () => {
    expect([1, 3, 12, 18, 24, 30, 120].map(monthsLabel)).toEqual([
      '1 month',
      '3 months',
      '12 months',
      '18 months',
      '2 years',
      '30 months',
      '10 years',
    ])
    expect([6, 12, 18, 24, 36, 30].map(shortTerm)).toEqual(['6m', '12m', '18m', '2y', '3y', '30m'])
  })
})

describe('the term slider', () => {
  const loan = { ...view, id: 'l', category: 'loans' as const, ladder: [], termMonths: 120 }
  const variable = {
    ...view,
    id: 'v',
    category: 'mortgages' as const,
    ladder: [],
    termMonths: null,
  }
  const saver = { ...view, id: 's', category: 'savings' as const, ladder: [], termMonths: 1 }
  const stops = termStops([view, loan, variable, saver])

  it('steps through the terms on sale in termed categories, shortest first', () => {
    // Savings' month is not a term to filter on; a variable mortgage has none.
    expect(stops).toEqual([6, 18, 120])
  })

  it('sits at the ends with no filter, and on the months a preset covers', () => {
    expect(termSpan(ANY_TERM, stops)).toEqual([0, 2])
    expect(termSpan(termFromBuckets(['13_to_24']), stops)).toEqual([1, 1])
    expect(termSpan(termFromBuckets(['up_to_6', 'over_5_years']), stops)).toEqual([0, 2])
    // A preset with no term on sale, or "Variable or none", leaves the slider at the ends.
    expect(termSpan(termFromBuckets(['7_to_12']), stops)).toEqual([0, 2])
    expect(termSpan(termFromBuckets(['none']), stops)).toEqual([0, 2])
    expect(termSpan({ kind: 'range', min: 18, max: 120 }, stops)).toEqual([1, 2])
  })

  it('turns the thumbs into a range of months, and both ends into no filter', () => {
    expect(termFromSpan(stops, [0, 2])).toEqual(ANY_TERM)
    expect(termFromSpan(stops, [1, 2])).toEqual({ kind: 'range', min: 18, max: 120 })
    expect(termFromSpan([], [0, 0])).toEqual(ANY_TERM)
    expect(termFromBuckets([])).toEqual(ANY_TERM)
  })

  it('keeps a product with a term in the range; a variable one only with no filter', () => {
    const range = { ...none, term: { kind: 'range' as const, min: 12, max: 24 } }
    expect(matchesFilters(view, range)).toBe(true) // the ladder's 18 months
    expect(matchesFilters(loan, range)).toBe(false)
    expect(matchesFilters(variable, range)).toBe(false)
    expect(matchesFilters(saver, range)).toBe(true)
    expect(matchesFilters(variable, none)).toBe(true)
  })

  it('says the term in the filter summary', () => {
    expect(termSummary(ANY_TERM)).toBe('')
    expect(termSummary(termFromBuckets(['none', 'up_to_6']))).toBe('2 terms')
    expect(termSummary({ kind: 'range', min: 6, max: 24 })).toBe('6 months to 2 years')
    expect(termSummary({ kind: 'range', min: 12, max: 12 })).toBe('12 months')
  })
})

describe('the sort', () => {
  const rated = (id: string, ratePct: number | null): MarketView => ({
    ...view,
    id,
    name: id,
    headline: { ratePct, label: '' },
  })

  it('orders by rate either way, with no rate last in both', () => {
    const list = [rated('b', 2), rated('none', null), rated('a', 3), rated('c', 1)]
    expect(sortViews(list, 'rate').map((v) => v.id)).toEqual(['a', 'b', 'c', 'none'])
    expect(sortViews(list, 'rate_low').map((v) => v.id)).toEqual(['c', 'b', 'a', 'none'])
  })
})

describe('Raisin', () => {
  const nordax: MarketView = {
    ...view,
    id: 'n',
    provider: 'nordax',
    providerName: 'Nordax Bank',
    platform: 'Raisin',
  }
  const banca: MarketView = { ...nordax, id: 'c', provider: 'banca_cf', providerName: 'Banca CF+' }

  it('names the platform first', () => {
    expect(providerLabel(nordax)).toBe('Raisin · Nordax Bank')
    expect(providerLabel(view)).toBe('Bank of Ireland')
  })

  it('groups the platform’s banks apart from the providers dealt with directly', () => {
    expect(providerGroups([nordax, view, banca])).toEqual({
      direct: [{ value: 'boi', label: 'Bank of Ireland' }],
      platforms: [
        {
          platform: 'Raisin',
          options: [
            { value: 'banca_cf', label: 'Banca CF+' },
            { value: 'nordax', label: 'Nordax Bank' },
          ],
        },
      ],
    })
  })

  it('draws the bank’s logo with the platform’s mark, the platform’s alone, or none', () => {
    const logos = new Set(['boi', 'nordax', 'raisin'])
    expect(logoOf(view, logos)).toEqual({ logo: 'boi', mark: null })
    expect(logoOf(nordax, logos)).toEqual({ logo: 'nordax', mark: 'raisin' })
    expect(logoOf(banca, logos)).toEqual({ logo: 'raisin', mark: null })
    expect(logoOf(banca, new Set())).toEqual({ logo: null, mark: null })
    expect(logoOf(nordax, new Set(['nordax']))).toEqual({ logo: 'nordax', mark: null })
    // A bank with a brand colour and no logo: its monogram, with the platform's mark.
    expect(logoOf(banca, logos, new Set(['banca_cf']))).toEqual({ logo: null, mark: 'raisin' })
    expect(logoOf(view, new Set(), new Set(['boi']))).toEqual({ logo: null, mark: null })
  })

  it('has a fetched logo for Raisin itself, to mark its banks', () => {
    expect(MARKET_LOGOS).toContain('raisin')
  })
})

describe('the card', () => {
  it('names the kind of account: a deposit is a fixed term, a saver what its access says', () => {
    const saver = (access: MarketView['access']): MarketView => ({
      ...view,
      category: 'savings',
      ladder: [],
      access,
    })
    expect(accountKindOf(view)).toBe('Fixed term')
    expect(accountKindOf({ ...view, access: null })).toBe('Fixed term')
    expect(
      (['Instant access', 'Notice', 'Regular saver'] as const).map((a) => accountKindOf(saver(a))),
    ).toEqual(['Instant access', 'Notice', 'Regular saver'])
    expect(accountKindOf(saver(null))).toBeNull()
    expect(accountKindOf({ ...view, category: 'mortgages', access: null })).toBeNull()
  })

  it('makes a monogram of the provider’s initials', () => {
    expect(
      ['Bank of Ireland', 'AIB', 'PTSB', 'Avant Money', 'bunq', 'Credit Union', 'Banca CF+'].map(
        monogram,
      ),
    ).toEqual(['BI', 'AIB', 'PTSB', 'AM', 'B', 'CU', 'BC'])
  })
})

describe('finding the raw row behind a source', () => {
  const row: MarketProductVersion = {
    provider: 'boi',
    source: 'ccpc',
    category: 'deposit',
    productId: 'deposit.c6',
    providerProductName: 'Fixed Term Deposit 6 Months',
    rates: { kind: 'deposit', aerPct: 2, basis: 'fixed' },
    conditions: {},
    sourceUrl: 'https://www.ccpc.ie/deposits',
    providerUrl: null,
    sourceProductId: '6',
    sourceUpdatedAt: null,
    attribution: null,
    unknown: [],
    effectiveFrom: null,
    firstSeenAt: '2026-10-01T00:00:00.000Z',
    checkedAt: '2026-11-12T00:00:00.000Z',
    supersededAt: null,
  }
  const groups = groupVersions([row, { ...row, source: 'bank' }])

  it('finds it by `<provider>:<productId>`, from the right source', () => {
    const source = { source: 'ccpc' as const, rowId: 'boi:deposit.c6', url: null, checkedAt: '' }
    expect(findRawGroup(groups, source)?.current?.source).toBe('ccpc')
    expect(findRawGroup(groups, { ...source, source: 'bank' })?.current?.source).toBe('bank')
    expect(findRawGroup(groups, { ...source, rowId: 'aib:deposit.c6' })).toBeUndefined()
  })
})
