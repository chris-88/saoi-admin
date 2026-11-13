import { describe, expect, it } from 'vitest'
import type { MarketProductVersion } from '@contracts/market.ts'
import {
  detailLines,
  unknownLine,
  conditionsLines,
  describeChange,
  groupVersions,
  ratesLines,
} from './marketFormat'

const base: MarketProductVersion = {
  provider: 'boi',
  source: 'bank',
  category: 'savings',
  productId: 'savings.supersaver',
  providerProductName: 'Supersaver',
  rates: { kind: 'deposit', aerPct: 2.5, basis: 'variable' },
  conditions: { takesMonthly: true, takesLumpSum: false, minMonthlyEur: 25, maxMonthlyEur: 500 },
  sourceUrl: 'https://example.invalid/s',
  providerUrl: null,
  sourceProductId: null,
  sourceUpdatedAt: null,
  attribution: null,
  unknown: [],
  effectiveFrom: null,
  firstSeenAt: '2026-10-01T00:00:00.000Z',
  checkedAt: '2026-11-01T00:00:00.000Z',
  supersededAt: null,
}

describe('market formatting', () => {
  it('reads rates and conditions as lines', () => {
    expect(ratesLines(base.rates)).toEqual([
      { label: 'Rate', value: '2.5% AER' },
      { label: 'Basis', value: 'variable' },
    ])
    expect(conditionsLines(base.conditions)).toContainEqual({
      label: 'Monthly amount',
      value: '€25 to €500',
    })
  })

  it('lists a term ladder', () => {
    const lines = ratesLines({
      kind: 'deposit',
      aerPct: null,
      basis: 'fixed',
      terms: [{ months: 12, aerPct: 2, termReturnPct: 2 }],
    })
    expect(lines).toContainEqual({ label: '12 months', value: '2% AER, 2% over the term' })
  })

  it('groups versions and finds the current one', () => {
    const old: MarketProductVersion = {
      ...base,
      rates: { kind: 'deposit', aerPct: 2.2, basis: 'variable' },
      firstSeenAt: '2026-09-01T00:00:00.000Z',
      supersededAt: '2026-10-01T00:00:00.000Z',
    }
    const [group] = groupVersions([old, base])
    expect(group?.current).toBe(base)
    expect(group?.versions.map((v) => v.firstSeenAt)).toEqual([base.firstSeenAt, old.firstSeenAt])
    expect(describeChange(old, base)).toEqual(['rates.aerPct: 2.2 → 2.5'])
  })

  it('describes an added and a removed field', () => {
    const next = { ...base, conditions: { takesMonthly: true, takesLumpSum: false, minAge: 18 } }
    expect(describeChange(base, next)).toEqual([
      'conditions.maxMonthlyEur: 500 → not stated',
      'conditions.minAge: not stated → 18',
      'conditions.minMonthlyEur: 25 → not stated',
    ])
  })

  it('reads every rate kind CCPC serves', () => {
    expect(
      ratesLines({
        kind: 'mortgage',
        rateType: 'fixed',
        fixedYears: 1,
        initialRatePct: 3.35,
        followOnRatePct: 4.15,
        fullTermRatePct: 4.2,
        ltvMinPct: 0,
        ltvMaxPct: 90,
        ber: 'B',
        cashback: false,
        customerTypes: ['first_time_buyer', 'switcher'],
      }),
    ).toEqual([
      { label: 'Rate', value: '3.35%' },
      { label: 'Type', value: 'fixed 1 year' },
      { label: 'Then', value: '4.15%' },
      { label: 'Full term', value: '4.2%' },
      { label: 'LTV', value: '0% to 90%' },
      { label: 'BER', value: 'B' },
      { label: 'Cashback', value: 'no' },
      { label: 'For', value: 'first-time buyer, switcher' },
    ])
    expect(
      ratesLines({
        kind: 'loan',
        aprPct: 6.5,
        rateType: null,
        maxAmountEur: 75000,
        maxTermMonths: 120,
        purposes: ['Home improvements'],
      }),
    ).toContainEqual({ label: 'Type', value: 'not stated' })
    expect(
      ratesLines({
        kind: 'credit_card',
        aprPct: 22.7,
        purchaseRatePct: 14,
        cashRatePct: 21.36,
        balanceTransferIntroMonths: 7,
        balanceTransferIntroPct: 0,
      }),
    ).toContainEqual({ label: 'Balance transfer', value: '0% for 7 months' })
    expect(
      ratesLines({
        kind: 'current_account',
        quarterlyFeeEur: 18,
        creditInterestPct: 0,
        overdraft: true,
      }),
    ).toEqual([
      { label: 'Fee a quarter', value: '€18' },
      { label: 'Credit interest', value: '0%' },
      { label: 'Overdraft', value: 'yes' },
    ])
  })

  it('lists tiers, says what the source leaves out, and keeps its own words', () => {
    expect(
      ratesLines({
        kind: 'deposit',
        aerPct: 3,
        basis: null,
        tiers: [
          { minEur: 10, maxEur: 12000, aerPct: 3 },
          { minEur: 12000.01, maxEur: null, aerPct: 0.25 },
        ],
      }),
    ).toEqual([
      { label: 'Rate', value: '3% AER' },
      { label: 'Basis', value: 'not stated' },
      { label: '€10 to €12,000', value: '3% AER' },
      { label: 'from €12,000.01', value: '0.25% AER' },
    ])
    const conditions = {
      takesMonthly: true,
      prose: { 'Introductory offers': 'Get a fixed regular savings rate for 12 months' },
      details: { 'Withdrawal notice period:': 'Instant access' },
    }
    expect(conditionsLines(conditions)).toEqual([
      { label: 'Monthly saving', value: 'yes' },
      { label: 'Introductory offers', value: 'Get a fixed regular savings rate for 12 months' },
    ])
    expect(detailLines(conditions)).toEqual([
      { label: 'Withdrawal notice period', value: 'Instant access' },
    ])
    expect(unknownLine(['rates.thenAerPct', 'conditions.minAge'])).toEqual({
      label: 'Not stated',
      value: 'rates.thenAerPct, conditions.minAge',
    })
    expect(unknownLine([])).toBeNull()
  })

  it('keeps a CCPC row and a provider-site row for one product apart', () => {
    const fromCcpc = { ...base, source: 'ccpc' as const }
    expect(groupVersions([base, fromCcpc])).toHaveLength(2)
  })
})
