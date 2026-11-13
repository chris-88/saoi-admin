import { z } from 'zod'
import type { MarketProductVersion } from '@contracts/market.ts'

/**
 * How market data reads to a person checking it against the provider's page: plain lines for
 * rates and conditions, the age of the last check, and what changed between two versions.
 */

export type Line = { readonly label: string; readonly value: string }

const pct = (value: number): string => `${String(value)}%`
const eur = (value: number): string => `€${value.toLocaleString('en-IE')}`

type Rates = MarketProductVersion['rates']

const yesNo = (value: boolean | null): string =>
  value === null ? 'not stated' : value ? 'yes' : 'no'
const pctOrUnknown = (value: number | null): string => (value === null ? 'not stated' : pct(value))

function depositLines(rates: Extract<Rates, { kind: 'deposit' }>): Line[] {
  const lines: Line[] = []
  if (rates.aerPct !== null) lines.push({ label: 'Rate', value: `${pct(rates.aerPct)} AER` })
  lines.push({ label: 'Basis', value: rates.basis ?? 'not stated' })
  if (rates.fixedMonths !== undefined) {
    lines.push({ label: 'Fixed for', value: `${String(rates.fixedMonths)} months` })
  }
  if (rates.thenAerPct !== undefined) lines.push({ label: 'Then', value: pct(rates.thenAerPct) })
  if (rates.tierCapEur !== undefined) {
    lines.push({ label: 'Up to', value: eur(rates.tierCapEur) })
  }
  if (rates.aboveTierAerPct !== undefined) {
    lines.push({ label: 'Above that', value: pct(rates.aboveTierAerPct) })
  }
  if (rates.lumpSumAerPct !== undefined) {
    lines.push({ label: 'Lump sum', value: pct(rates.lumpSumAerPct) })
  }
  for (const tier of rates.tiers ?? []) {
    const band =
      tier.maxEur === null
        ? `from ${eur(tier.minEur)}`
        : `${eur(tier.minEur)} to ${eur(tier.maxEur)}`
    lines.push({ label: band, value: `${pct(tier.aerPct)} AER` })
  }
  if (rates.termMonths !== undefined) {
    lines.push({ label: 'Term', value: `${String(rates.termMonths)} months` })
  }
  if (rates.noticeDays !== undefined) {
    lines.push({
      label: 'Notice',
      value: rates.noticeDays === 0 ? 'none' : `${String(rates.noticeDays)} days`,
    })
  }
  for (const term of rates.terms ?? []) {
    const gross =
      term.termReturnPct === undefined ? '' : `, ${pct(term.termReturnPct)} over the term`
    lines.push({ label: `${String(term.months)} months`, value: `${pct(term.aerPct)} AER${gross}` })
  }
  return lines
}

const CUSTOMER_TYPES: Readonly<Record<string, string>> = {
  first_time_buyer: 'first-time buyer',
  mover: 'mover',
  switcher: 'switcher',
}

export function ratesLines(rates: Rates): Line[] {
  switch (rates.kind) {
    case 'deposit':
      return depositLines(rates)
    case 'mortgage': {
      const type =
        rates.rateType === null
          ? 'not stated'
          : rates.rateType === 'fixed' && rates.fixedYears !== null
            ? `fixed ${String(rates.fixedYears)} year${rates.fixedYears === 1 ? '' : 's'}`
            : rates.rateType
      const ltv =
        rates.ltvMinPct === null && rates.ltvMaxPct === null
          ? 'not stated'
          : `${rates.ltvMinPct === null ? '?' : String(rates.ltvMinPct)}% to ${rates.ltvMaxPct === null ? '?' : String(rates.ltvMaxPct)}%`
      return [
        { label: 'Rate', value: pct(rates.initialRatePct) },
        { label: 'Type', value: type },
        { label: 'Then', value: pctOrUnknown(rates.followOnRatePct) },
        { label: 'Full term', value: pctOrUnknown(rates.fullTermRatePct) },
        { label: 'LTV', value: ltv },
        { label: 'BER', value: rates.ber ?? 'any' },
        { label: 'Cashback', value: yesNo(rates.cashback) },
        {
          label: 'For',
          value: rates.customerTypes.map((t) => CUSTOMER_TYPES[t] ?? t).join(', '),
        },
      ]
    }
    case 'loan':
      return [
        { label: 'APR', value: pct(rates.aprPct) },
        { label: 'Type', value: rates.rateType ?? 'not stated' },
        {
          label: 'Up to',
          value: rates.maxAmountEur === null ? 'not stated' : eur(rates.maxAmountEur),
        },
        {
          label: 'Longest term',
          value:
            rates.maxTermMonths === null ? 'not stated' : `${String(rates.maxTermMonths)} months`,
        },
        {
          label: 'For',
          value: rates.purposes.length === 0 ? 'not stated' : rates.purposes.join(', '),
        },
      ]
    case 'credit_card': {
      const transfer =
        rates.balanceTransferIntroMonths === null || rates.balanceTransferIntroMonths === 0
          ? 'none stated'
          : `${pctOrUnknown(rates.balanceTransferIntroPct)} for ${String(rates.balanceTransferIntroMonths)} months`
      return [
        { label: 'APR', value: pctOrUnknown(rates.aprPct) },
        { label: 'Purchases', value: pctOrUnknown(rates.purchaseRatePct) },
        { label: 'Cash', value: pctOrUnknown(rates.cashRatePct) },
        { label: 'Balance transfer', value: transfer },
      ]
    }
    case 'current_account':
      return [
        {
          label: 'Fee a quarter',
          value: rates.quarterlyFeeEur === null ? 'not stated' : eur(rates.quarterlyFeeEur),
        },
        { label: 'Credit interest', value: pctOrUnknown(rates.creditInterestPct) },
        { label: 'Overdraft', value: yesNo(rates.overdraft) },
      ]
    default:
      return assertNever(rates)
  }
}

/** Bounds on the headline rate, in percent; null is unset. */
export type RateBounds = { readonly min: number | null; readonly max: number | null }

/** Whether a headline rate passes the bounds. A product with no rate passes only unbounded. */
export function withinRate(rate: number | null, { min, max }: RateBounds): boolean {
  if (min === null && max === null) return true
  if (rate === null) return false
  return (min === null || rate >= min) && (max === null || rate <= max)
}

const rateBoundSchema = z.coerce.number().finite().nonnegative().max(100)

/** A typed bound, validated: a percentage, or null when blank or not a number. */
export function parseRateBound(text: string): number | null {
  const trimmed = text.trim().replace(',', '.')
  if (trimmed === '') return null
  const parsed = rateBoundSchema.safeParse(trimmed)
  return parsed.success ? parsed.data : null
}

function assertNever(value: never): never {
  throw new Error(`Unexpected rate kind: ${JSON.stringify(value)}`)
}

export function conditionsLines(conditions: MarketProductVersion['conditions']): Line[] {
  const lines: Line[] = []
  const said = (value: boolean | undefined) =>
    value === undefined ? undefined : value ? 'yes' : 'no'
  const monthly = said(conditions.takesMonthly)
  const lump = said(conditions.takesLumpSum)
  if (monthly !== undefined) lines.push({ label: 'Monthly saving', value: monthly })
  if (lump !== undefined) lines.push({ label: 'Lump sum', value: lump })
  const range = (label: string, min: number | undefined, max: number | undefined) => {
    if (min === undefined && max === undefined) return
    const text =
      min !== undefined && max !== undefined
        ? `${eur(min)} to ${eur(max)}`
        : min !== undefined
          ? `from ${eur(min)}`
          : `up to ${eur(max ?? 0)}`
    lines.push({ label, value: text })
  }
  range('Monthly amount', conditions.minMonthlyEur, conditions.maxMonthlyEur)
  range('Lump sum amount', conditions.minLumpSumEur, conditions.maxLumpSumEur)
  if (conditions.minAge !== undefined)
    lines.push({ label: 'Minimum age', value: String(conditions.minAge) })
  const bonus = conditions.bonus
  if (bonus !== undefined) {
    const parts = [
      `${eur(bonus.amountEur)}${bonus.lessDirt ? ' less DIRT' : ''}`,
      `save ${eur(bonus.minMonthlyEur)} a month for ${String(bonus.minMonths)} months (${eur(bonus.minTotalEur)} in all)`,
      `mortgage drawn within ${String(bonus.withinMonths)} months`,
    ]
    if (bonus.firstTimeBuyerOnly) parts.push('first-time buyers only')
    if (bonus.requiresMortgageHere) parts.push('mortgage must be with this provider')
    lines.push({ label: 'Bonus', value: parts.join('; ') })
  }
  // The source's own words. Long, so the column wraps rather than widens.
  for (const [label, value] of Object.entries(conditions.prose ?? {})) {
    lines.push({ label, value })
  }
  return lines
}

/** The fields the source leaves out that Saoi would need, in words. */
export function unknownLine(unknown: readonly string[]): Line | null {
  if (unknown.length === 0) return null
  return { label: 'Not stated', value: unknown.join(', ') }
}

/** Every field the source states, by its own label: for the detail panel. */
export function detailLines(conditions: MarketProductVersion['conditions']): Line[] {
  return Object.entries(conditions.details ?? {}).map(([label, value]) => ({
    label: label.replace(/:\s*$/, ''),
    value,
  }))
}

export const SOURCE_LABELS: Readonly<Record<MarketProductVersion['source'], string>> = {
  bank: 'Provider site',
  ccpc: 'CCPC',
}

export type MarketGroup = {
  readonly key: string
  readonly current: MarketProductVersion | undefined
  /** Every version, newest first. */
  readonly versions: readonly MarketProductVersion[]
}

/** Versions grouped by provider product, in the order the API sent them. */
export function groupVersions(items: readonly MarketProductVersion[]): MarketGroup[] {
  const byKey = new Map<string, MarketProductVersion[]>()
  for (const item of items) {
    const key = `${item.provider}/${item.source}/${item.productId}`
    byKey.set(key, [...(byKey.get(key) ?? []), item])
  }
  return [...byKey.entries()].map(([key, versions]) => ({
    key,
    current: versions.find((v) => v.supersededAt === null),
    versions: [...versions].sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt)),
  }))
}

function flatten(value: unknown, path: string, out: Map<string, string>): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${path}[${String(index)}]`, out))
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, inner] of Object.entries(value)) {
      flatten(inner, path === '' ? key : `${path}.${key}`, out)
    }
  } else {
    out.set(
      path,
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : 'none',
    )
  }
}

/** What differs between two versions of one product, one line per changed field. */
export function describeChange(older: MarketProductVersion, newer: MarketProductVersion): string[] {
  const fields = (v: MarketProductVersion) => ({
    name: v.providerProductName,
    category: v.category,
    sourceUrl: v.sourceUrl,
    providerUrl: v.providerUrl,
    sourceUpdatedAt: v.sourceUpdatedAt,
    unknown: v.unknown,
    effectiveFrom: v.effectiveFrom,
    rates: v.rates,
    conditions: v.conditions,
  })
  const before = new Map<string, string>()
  const after = new Map<string, string>()
  flatten(fields(older), '', before)
  flatten(fields(newer), '', after)
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort()
  return keys.flatMap((key) => {
    const from = before.get(key)
    const to = after.get(key)
    return from === to ? [] : [`${key}: ${from ?? 'not stated'} → ${to ?? 'not stated'}`]
  })
}
