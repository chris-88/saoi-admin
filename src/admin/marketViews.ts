import type { MarketGroup, RateBounds } from '@/admin/marketFormat'
import { withinRate } from '@/admin/marketFormat'
import {
  ADMIN_MARKET_CATEGORIES,
  type AdminMarketAccess,
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

/** Every term a view offers, in months: a ladder's rungs, or its one term; none for variable. */
export function termMonthsOf(view: MarketView): number[] {
  if (view.ladder.length > 0) return view.ladder.map((rung) => rung.months)
  return view.termMonths === null ? [] : [view.termMonths]
}

/** Each bucket's months, both ends included, so a preset can be drawn on the slider. */
const BUCKET_MONTHS: Readonly<Record<Exclude<TermBucket, 'none'>, readonly [number, number]>> = {
  up_to_6: [0, 6],
  '7_to_12': [7, 12],
  '13_to_24': [13, 24],
  '2_to_3_years': [25, 36],
  '4_to_5_years': [37, 60],
  over_5_years: [61, Number.POSITIVE_INFINITY],
}

/**
 * The Term filter, one value: nothing chosen, some presets (the buckets), or a range of months
 * set on the slider. Choosing a preset replaces a range; moving the slider replaces the presets.
 */
export type TermFilter =
  | { readonly kind: 'any' }
  | { readonly kind: 'buckets'; readonly buckets: readonly TermBucket[] }
  | { readonly kind: 'range'; readonly min: number; readonly max: number }

export const ANY_TERM: TermFilter = { kind: 'any' }

/** A preset choice; choosing none is no filter. */
export function termFromBuckets(buckets: readonly string[]): TermFilter {
  const picked = TERM_BUCKETS.filter((bucket) => buckets.includes(bucket))
  return picked.length === 0 ? ANY_TERM : { kind: 'buckets', buckets: picked }
}

/**
 * The slider's stops: every term in months that a termed product offers, shortest first, so
 * each step lands on a term somebody sells.
 */
export function termStops(views: readonly MarketView[]): number[] {
  const months = new Set<number>()
  for (const view of views) {
    if (TERMED_CATEGORIES.has(view.category)) for (const m of termMonthsOf(view)) months.add(m)
  }
  return [...months].sort((a, b) => a - b)
}

/** Where the slider's two thumbs sit, as indexes into the stops, for the Term value. */
export function termSpan(term: TermFilter, stops: readonly number[]): [number, number] {
  const full: [number, number] = [0, Math.max(0, stops.length - 1)]
  const span = (min: number, max: number): [number, number] => {
    const from = stops.findIndex((m) => m >= min)
    const to = stops.findLastIndex((m) => m <= max)
    return from === -1 || to === -1 || from > to ? full : [from, to]
  }
  switch (term.kind) {
    case 'any':
      return full
    case 'range':
      return span(term.min, term.max)
    case 'buckets': {
      const ranges = term.buckets.flatMap((bucket) =>
        bucket === 'none' ? [] : [BUCKET_MONTHS[bucket]],
      )
      if (ranges.length === 0) return full
      return span(
        Math.min(...ranges.map(([min]) => min)),
        Math.max(...ranges.map(([, max]) => max)),
      )
    }
    default:
      return assertNever(term)
  }
}

/** The slider's thumbs as a Term value: both at the ends is no filter. */
export function termFromSpan(stops: readonly number[], span: readonly number[]): TermFilter {
  const from = span[0] ?? 0
  const to = span[1] ?? stops.length - 1
  const min = stops[from]
  const max = stops[to]
  if (min === undefined || max === undefined) return ANY_TERM
  return from === 0 && to === stops.length - 1 ? ANY_TERM : { kind: 'range', min, max }
}

function matchesTerm(view: MarketView, term: TermFilter): boolean {
  if (!TERMED_CATEGORIES.has(view.category)) return true
  switch (term.kind) {
    case 'any':
      return true
    case 'buckets':
      return [...termBucketsOf(view)].some((bucket) => term.buckets.includes(bucket))
    case 'range':
      // A variable product has no term to fall in a range.
      return termMonthsOf(view).some((m) => m >= term.min && m <= term.max)
    default:
      return assertNever(term)
  }
}

/** "3 months", "18 months", "2 years", "10 years". */
export function monthsLabel(months: number): string {
  if (months >= 24 && months % 12 === 0) return `${String(months / 12)} years`
  return months === 1 ? '1 month' : `${String(months)} months`
}

/** The Term value in words, for the filter summary: "2 terms", "6 months to 2 years". */
export function termSummary(term: TermFilter): string {
  switch (term.kind) {
    case 'any':
      return ''
    case 'buckets':
      return term.buckets.length === 1 ? '1 term' : `${String(term.buckets.length)} terms`
    case 'range':
      return term.min === term.max
        ? monthsLabel(term.min)
        : `${monthsLabel(term.min)} to ${monthsLabel(term.max)}`
    default:
      return assertNever(term)
  }
}

// ---- Filters and sort -------------------------------------------------------------------------

export type ViewFilters = {
  readonly sources: readonly string[]
  readonly providers: readonly string[]
  readonly categories: readonly string[]
  readonly term: TermFilter
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
    matchesTerm(view, filters.term) &&
    withinRate(view.headline.ratePct, filters.rate)
  )
}

export const SORTS = ['rate', 'rate_low', 'name', 'changed', 'checked'] as const
export type SortKey = (typeof SORTS)[number]
export const DEFAULT_SORT: SortKey = 'name'

export const SORT_LABELS: Readonly<Record<SortKey, string>> = {
  rate: 'Rate, high to low',
  rate_low: 'Rate, low to high',
  name: 'Name',
  changed: 'Recently changed',
  checked: 'Recently checked',
}

/** Who a card names: the bank, or "Raisin · Nordax Bank" for a bank sold through Raisin. */
export function providerLabel(view: MarketView): string {
  return view.platform === null ? view.providerName : `${view.platform} · ${view.providerName}`
}

const byName = (a: MarketView, b: MarketView): number =>
  providerLabel(a).localeCompare(providerLabel(b), 'en-IE') || a.name.localeCompare(b.name, 'en-IE')

/** Newest first, a missing date last. ISO dates compare as strings. */
const byDateDescending = (a: string | null, b: string | null): number =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : b.localeCompare(a)

/** By rate either way; a view with no rate goes last in both. */
const byRate =
  (direction: 1 | -1) =>
  (a: MarketView, b: MarketView): number => {
    const x = a.headline.ratePct
    const y = b.headline.ratePct
    return x === y ? 0 : x === null ? 1 : y === null ? -1 : direction * (x - y)
  }

/**
 * The sort, each with the name as the tie-break. "Name" is provider, then product, so one
 * provider's products sit together, and Raisin's banks together under R. A view with no rate,
 * or never changed, goes last.
 */
export function sortViews(views: readonly MarketView[], key: SortKey): MarketView[] {
  const compare = ((): ((a: MarketView, b: MarketView) => number) => {
    switch (key) {
      case 'rate':
        return byRate(-1)
      case 'rate_low':
        return byRate(1)
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
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`)
}

export type Option = { readonly value: string; readonly label: string }

const byLabel = (a: Option, b: Option): number => a.label.localeCompare(b.label, 'en-IE')

/** Each provider once, by its readable name. */
export function providerOptions(views: readonly MarketView[]): Option[] {
  const names = new Map<string, string>()
  for (const view of views) names.set(view.provider, view.providerName)
  return [...names.entries()].map(([value, label]) => ({ value, label })).sort(byLabel)
}

export type Platform = NonNullable<MarketView['platform']>

/**
 * The Provider filter's choices: the providers dealt with directly, then each platform's banks
 * under its name. A provider with any product on a platform is listed under it.
 */
export function providerGroups(views: readonly MarketView[]): {
  readonly direct: Option[]
  readonly platforms: { readonly platform: Platform; readonly options: Option[] }[]
} {
  const onPlatform = new Map<string, Platform>()
  for (const view of views) if (view.platform !== null) onPlatform.set(view.provider, view.platform)
  const all = providerOptions(views)
  const platforms = [...new Set(onPlatform.values())].sort().map((platform) => ({
    platform,
    options: all.filter((option) => onPlatform.get(option.value) === platform),
  }))
  return { direct: all.filter((option) => !onPlatform.has(option.value)), platforms }
}

// ---- The card ------------------------------------------------------------------------------

/**
 * The kind of account, for the chip beside the category: a deposit is always a fixed term; a
 * savings account is what its `access` says ("Instant access", "Notice", "Regular saver").
 */
export function accountKindOf(view: MarketView): AdminMarketAccess | null {
  if (view.category === 'deposits') return 'Fixed term'
  return view.category === 'savings' ? view.access : null
}

/**
 * Which logo a card draws, from the provider ids with a fetched logo and those with a brand
 * colour: its own, with the platform's mark on it when it is sold through one; when it has none,
 * its monogram in its brand colour with the platform's mark, or else the platform's logo alone;
 * else null, for the monogram.
 */
export function logoOf(
  view: MarketView,
  logos: ReadonlySet<string>,
  branded: ReadonlySet<string> = new Set(),
): { readonly logo: string | null; readonly mark: string | null } {
  const platform = view.platform === null ? null : view.platform.toLowerCase()
  const platformMark = platform !== null && logos.has(platform) ? platform : null
  if (logos.has(view.provider)) return { logo: view.provider, mark: platformMark }
  if (branded.has(view.provider)) return { logo: null, mark: platformMark }
  return { logo: platformMark, mark: null }
}

/** "BI" for Bank of Ireland, "AIB", "PTSB", "AM" for Avant Money, "B" for bunq. */
export function monogram(name: string): string {
  const words = name.split(/[\s-]+/).filter((word) => /^[\p{Lu}\d]/u.test(word))
  if (words.length >= 2)
    return words
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join('')
  const word = words[0] ?? name.trim()
  if (word.length <= 4 && word === word.toUpperCase()) return word
  return word.charAt(0).toUpperCase()
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
