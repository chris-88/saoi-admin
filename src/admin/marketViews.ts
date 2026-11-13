import type { MarketGroup, RateBounds } from '@/admin/marketFormat'
import { withinRate } from '@/admin/marketFormat'
import {
  ADMIN_MARKET_CATEGORIES,
  type AdminMarketCategory,
  type AdminMarketView,
  type AdminMarketViews,
} from '@contracts/market.ts'

/**
 * The market as the comparison engine sees it (`GET /api/admin/market/views`, contract
 * `adminMarketViewsSchema`): one view per product, a bank-direct row and its CCPC twin folded
 * together, CCPC's one-row-per-term deposits folded into a ladder. The raw rows behind a view,
 * with their history, stay on `GET /api/admin/market-products`; `sources[].rowId` finds them.
 */

export type MarketView = AdminMarketView
export type MarketViews = AdminMarketViews
export type MarketViewCategory = AdminMarketCategory
export type MarketViewSource = MarketView['sources'][number]

export const MARKET_VIEW_CATEGORIES = ADMIN_MARKET_CATEGORIES

/** The labels the engine sends, for the filter to offer every category in a fixed order. */
export const CATEGORY_LABELS: Readonly<Record<MarketViewCategory, string>> = {
  savings: 'Savings',
  deposits: 'Deposits',
  mortgages: 'Mortgages',
  loans: 'Loans',
  credit_cards: 'Credit cards',
  current_accounts: 'Current accounts',
}

// ---- Term ----------------------------------------------------------------------------------

export const TERM_BUCKETS = [
  'up_to_6',
  '7_to_12',
  '13_to_24',
  '2_to_3_years',
  '4_to_5_years',
  'over_5_years',
  'none',
] as const
export type TermBucket = (typeof TERM_BUCKETS)[number]

export const TERM_LABELS: Readonly<Record<TermBucket, string>> = {
  up_to_6: 'Up to 6 months',
  '7_to_12': '7 to 12 months',
  '13_to_24': '13 to 24 months',
  '2_to_3_years': '2 to 3 years',
  '4_to_5_years': '4 to 5 years',
  over_5_years: 'Over 5 years',
  none: 'Variable or none',
}

/** The categories a term means something for; every other category passes the Term filter. */
export const TERMED_CATEGORIES: ReadonlySet<MarketViewCategory> = new Set([
  'deposits',
  'loans',
  'mortgages',
])

/** "2 to 3 years" is 25 to 36 months, "4 to 5 years" 37 to 60, so every month count has one. */
export function termBucketOf(months: number | null): TermBucket {
  if (months === null) return 'none'
  if (months <= 6) return 'up_to_6'
  if (months <= 12) return '7_to_12'
  if (months <= 24) return '13_to_24'
  if (months <= 36) return '2_to_3_years'
  if (months <= 60) return '4_to_5_years'
  return 'over_5_years'
}

/** A ladder offers each of its terms; anything else, its one term (or none). */
export function termBucketsOf(view: MarketView): ReadonlySet<TermBucket> {
  return new Set(
    view.ladder.length > 0
      ? view.ladder.map((rung) => termBucketOf(rung.months))
      : [termBucketOf(view.termMonths)],
  )
}

// ---- Filters and sort -------------------------------------------------------------------------

export type ViewFilters = {
  readonly sources: readonly string[]
  readonly providers: readonly string[]
  readonly categories: readonly string[]
  readonly terms: readonly string[]
  readonly rate: RateBounds
}

/** A value passes a filter when nothing is chosen in it, or the value is among those chosen. */
const chosen = (values: readonly string[], value: string): boolean =>
  values.length === 0 || values.includes(value)

export function matchesFilters(view: MarketView, filters: ViewFilters): boolean {
  return (
    (filters.sources.length === 0 ||
      view.sources.some((source) => filters.sources.includes(source.source))) &&
    chosen(filters.providers, view.provider) &&
    chosen(filters.categories, view.category) &&
    (filters.terms.length === 0 ||
      !TERMED_CATEGORIES.has(view.category) ||
      [...termBucketsOf(view)].some((bucket) => filters.terms.includes(bucket))) &&
    withinRate(view.headline.ratePct, filters.rate)
  )
}

export const SORTS = ['rate', 'name', 'changed', 'checked'] as const
export type SortKey = (typeof SORTS)[number]
export const DEFAULT_SORT: SortKey = 'name'

export const SORT_LABELS: Readonly<Record<SortKey, string>> = {
  rate: 'Rate, high to low',
  name: 'Name',
  changed: 'Recently changed',
  checked: 'Recently checked',
}

const byName = (a: MarketView, b: MarketView): number =>
  a.providerName.localeCompare(b.providerName, 'en-IE') || a.name.localeCompare(b.name, 'en-IE')

/** Newest first, a missing date last. ISO dates compare as strings. */
const byDateDescending = (a: string | null, b: string | null): number =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : b.localeCompare(a)

/**
 * The sort, each with the name as the tie-break. "Name" is provider, then product, so one
 * provider's products sit together. A view with no rate, or never changed, goes last.
 */
export function sortViews(views: readonly MarketView[], key: SortKey): MarketView[] {
  const compare = ((): ((a: MarketView, b: MarketView) => number) => {
    switch (key) {
      case 'rate':
        return (a, b) => {
          const x = a.headline.ratePct
          const y = b.headline.ratePct
          return x === y ? 0 : x === null ? 1 : y === null ? -1 : y - x
        }
      case 'name':
        return () => 0
      case 'changed':
        return (a, b) => byDateDescending(a.lastChangedAt, b.lastChangedAt)
      case 'checked':
        return (a, b) => byDateDescending(a.checkedAt, b.checkedAt)
      default:
        return assertNever(key)
    }
  })()
  return [...views].sort((a, b) => compare(a, b) || byName(a, b))
}

function assertNever(value: never): never {
  throw new Error(`Unhandled sort: ${String(value)}`)
}

export type Option = { readonly value: string; readonly label: string }

/** Each provider once, by its readable name. */
export function providerOptions(views: readonly MarketView[]): Option[] {
  const names = new Map<string, string>()
  for (const view of views) names.set(view.provider, view.providerName)
  return [...names.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en-IE'))
}

// ---- Sources ---------------------------------------------------------------------------------

/** A source's key within its view: one view can hold several rows from one source (a ladder). */
export const sourceKey = (source: MarketViewSource): string => `${source.source}|${source.rowId}`

/** The raw row a view's source came from: the engine names a row `<provider>:<productId>`. */
export function findRawGroup(
  groups: readonly MarketGroup[],
  source: MarketViewSource,
): MarketGroup | undefined {
  return groups.find((group) => {
    const row = group.current ?? group.versions[0]
    return (
      row !== undefined &&
      row.source === source.source &&
      source.rowId === `${row.provider}:${row.productId}`
    )
  })
}

/** "18m" or "5y": compact enough for a ladder's row of terms. */
export function shortTerm(months: number): string {
  return months >= 24 && months % 12 === 0 ? `${String(months / 12)}y` : `${String(months)}m`
}

const DATE = new Intl.DateTimeFormat('en-IE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** "10 Nov 2026". */
export function shortDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso.slice(0, 10) : DATE.format(date)
}
