import { describe, expect, it } from 'vitest'
import type { MarketProductVersion } from '@contracts/market.ts'
import { adminMarketViewsSchema } from '@contracts/market.ts'
import { groupVersions } from './marketFormat'
import {
  findRawGroup,
  matchesFilters,
  shortTerm,
  termBucketOf,
  type MarketView,
} from './marketViews'

const view: MarketView = {
  id: 'boi:deposits.ladder_fixed_term',
  provider: 'boi',
  providerName: 'Bank of Ireland',
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
  terms: [],
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
    expect(matchesFilters(view, { ...none, terms: ['13_to_24'] })).toBe(true)
    expect(matchesFilters(view, { ...none, terms: ['7_to_12'] })).toBe(false)
    expect(matchesFilters(view, { ...none, terms: ['none'] })).toBe(false)
    const card = { ...view, category: 'credit_cards' as const, ladder: [] }
    expect(matchesFilters(card, { ...none, terms: ['7_to_12'] })).toBe(true)
    const variable = { ...view, category: 'mortgages' as const, ladder: [] }
    expect(matchesFilters(variable, { ...none, terms: ['none'] })).toBe(true)
  })

  it('writes a term short', () => {
    expect([6, 12, 18, 24, 36, 30].map(shortTerm)).toEqual(['6m', '12m', '18m', '2y', '3y', '30m'])
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
