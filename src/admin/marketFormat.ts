import type { MarketProductVersion } from '@contracts/market.ts'

/**
 * How market data reads to a person checking it against the provider's page: plain lines for
 * rates and conditions, the age of the last check, and what changed between two versions.
 */

export type Line = { readonly label: string; readonly value: string }

/** A check older than this is stale: the refresh runs weekly. */
export const STALE_AFTER_DAYS = 8

const pct = (value: number): string => `${String(value)}%`
const eur = (value: number): string => `€${value.toLocaleString('en-IE')}`

export function ratesLines(rates: MarketProductVersion['rates']): Line[] {
  const lines: Line[] = []
  if (rates.aerPct !== null) lines.push({ label: 'Rate', value: `${pct(rates.aerPct)} AER` })
  lines.push({ label: 'Basis', value: rates.basis })
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
  for (const term of rates.terms ?? []) {
    const gross =
      term.termReturnPct === undefined ? '' : `, ${pct(term.termReturnPct)} over the term`
    lines.push({ label: `${String(term.months)} months`, value: `${pct(term.aerPct)} AER${gross}` })
  }
  return lines
}

export function conditionsLines(conditions: MarketProductVersion['conditions']): Line[] {
  const lines: Line[] = [
    { label: 'Monthly saving', value: conditions.takesMonthly ? 'yes' : 'no' },
    { label: 'Lump sum', value: conditions.takesLumpSum ? 'yes' : 'no' },
  ]
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
  return lines
}

const DAY_MS = 86_400_000

export type Age = { readonly days: number; readonly label: string; readonly stale: boolean }

export function checkedAge(checkedAt: string, now: Date): Age {
  const days = Math.max(0, Math.floor((now.getTime() - new Date(checkedAt).getTime()) / DAY_MS))
  const label = days === 0 ? 'today' : days === 1 ? '1 day ago' : `${String(days)} days ago`
  return { days, label, stale: days > STALE_AFTER_DAYS }
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
    const key = `${item.provider}/${item.productId}`
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
