import { describe, expect, it } from 'vitest'
import type { MarketProductVersion } from '@contracts/market.ts'
import {
  checkedAge,
  conditionsLines,
  describeChange,
  groupVersions,
  ratesLines,
} from './marketFormat'

const base: MarketProductVersion = {
  provider: 'boi',
  category: 'savings',
  productId: 'savings.supersaver',
  providerProductName: 'Supersaver',
  rates: { kind: 'deposit', aerPct: 2.5, basis: 'variable' },
  conditions: { takesMonthly: true, takesLumpSum: false, minMonthlyEur: 25, maxMonthlyEur: 500 },
  sourceUrl: 'https://example.invalid/s',
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

  it('marks a check stale after 8 days, not at 8', () => {
    const now = new Date('2026-11-10T00:00:00.000Z')
    expect(checkedAge('2026-11-02T00:00:00.000Z', now)).toMatchObject({ days: 8, stale: false })
    expect(checkedAge('2026-11-01T00:00:00.000Z', now)).toMatchObject({ days: 9, stale: true })
    expect(checkedAge('2026-11-10T00:00:00.000Z', now).label).toBe('today')
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
})
