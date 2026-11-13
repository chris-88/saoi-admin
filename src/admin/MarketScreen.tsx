import { Fragment, useId, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  SlidersHorizontalIcon,
} from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Code } from '@/components/Code'
import { PageHeader } from '@/admin/parts'
import { adminApi } from '@/admin/adminClient'
import {
  describeChange,
  detailLines,
  groupVersions,
  parseRateBound,
  SOURCE_LABELS,
  conditionsLines,
  ratesLines,
  unknownLine,
  type Line,
  type MarketGroup,
} from '@/admin/marketFormat'
import {
  CATEGORY_LABELS,
  DEFAULT_SORT,
  findRawGroup,
  MARKET_VIEW_CATEGORIES,
  matchesFilters,
  providerOptions,
  shortDate,
  shortTerm,
  sortViews,
  SORT_LABELS,
  SORTS,
  sourceKey,
  TERM_BUCKETS,
  TERM_LABELS,
  type MarketView,
  type MarketViewSource,
  type Option,
  type SortKey,
} from '@/admin/marketViews'
import { queryKeys } from '@/lib/queryKeys'
import { useIsNarrow } from '@/lib/useIsNarrow'
import { cn } from '@/lib/utils'
import { CCPC_ATTRIBUTION } from '@/shared/market/schema.ts'
import type { MarketProductVersion } from '@contracts/market.ts'

/**
 * Market data: the market as the comparison engine sees it, one entry per product. A product
 * read from the provider's own page and from CCPC is one card, and CCPC's one-row-per-term
 * deposits are one card with a ladder. Each card's sources open the raw row behind it, with
 * its history, so a person can hold it against the page it came from. Read-only.
 *
 * Three layouts from one tree, by viewport: a phone (under `md`, where the console's sidebar
 * folds away) gets one column with the filters in a bottom sheet; a tablet (the iPad PWA, `md`
 * to `lg`) gets the filters as a panel above two columns; the desk gets them as a left rail
 * beside three. Columns never go under 16rem, so with the sidebar open a narrow pane takes
 * fewer.
 */
export function MarketScreen(): ReactNode {
  const phone = useIsNarrow(TABLET_FROM_PX)
  const belowDesk = useIsNarrow(DESK_FROM_PX)
  const layout: Layout = phone ? 'phone' : belowDesk ? 'tablet' : 'desk'

  const market = useQuery({
    queryKey: queryKeys.admin.marketViews(),
    queryFn: () => adminApi.listMarketViews(),
  })
  // Each filter is a set of chosen values; none chosen means every value.
  const [sources, setSources] = useState<readonly string[]>([])
  const [providers, setProviders] = useState<readonly string[]>([])
  const [categories, setCategories] = useState<readonly string[]>([])
  const [terms, setTerms] = useState<readonly string[]>([])
  const [rateMin, setRateMin] = useState('')
  const [rateMax, setRateMax] = useState('')
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT)
  const [panelOpen, setPanelOpen] = useState(readPanelOpen)
  const panelId = useId()

  const views = useMemo(() => market.data?.views ?? [], [market.data])
  const providerChoices = useMemo(() => providerOptions(views), [views])
  const sourceChoices = useMemo(
    () =>
      (['bank', 'ccpc'] as const)
        .filter((source) => views.some((view) => view.sources.some((s) => s.source === source)))
        .map((source) => ({ value: source, label: SOURCE_LABELS[source] })),
    [views],
  )
  const rate = { min: parseRateBound(rateMin), max: parseRateBound(rateMax) }
  const rateBounded = rate.min !== null || rate.max !== null
  const shown = sortViews(
    views.filter((view) => matchesFilters(view, { sources, providers, categories, terms, rate })),
    sort,
  )
  const showsCcpc = shown.some((view) => view.sources.some((s) => s.source === 'ccpc'))

  const activeFilters =
    [sources, providers, categories, terms].filter((values) => values.length > 0).length +
    (rateBounded ? 1 : 0) +
    (sort === DEFAULT_SORT ? 0 : 1)
  const clearFilters = () => {
    setSources([])
    setProviders([])
    setCategories([])
    setTerms([])
    setRateMin('')
    setRateMax('')
    setSort(DEFAULT_SORT)
  }
  const count = resultCount(shown.length, views.length)
  const summary = [
    count,
    counted(sources.length, 'source', 'sources'),
    counted(providers.length, 'provider', 'providers'),
    counted(categories.length, 'category', 'categories'),
    counted(terms.length, 'term', 'terms'),
  ].filter((part) => part !== '')

  // A tablet's panel sets each label beside its chips, so the open panel leaves room for cards.
  const inline = layout === 'tablet'
  const groups = [
    <SortControl key="sort" value={sort} onChange={setSort} inline={inline} />,
    <ChipFilter
      key="category"
      label="Category"
      value={categories}
      options={MARKET_VIEW_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
      onChange={setCategories}
      inline={inline}
    />,
    <ChipFilter
      key="term"
      label="Term"
      hint="Deposits, loans and mortgages; other categories pass."
      value={terms}
      options={TERM_BUCKETS.map((t) => ({ value: t, label: TERM_LABELS[t] }))}
      onChange={setTerms}
      inline={inline}
    />,
    <ChipFilter
      key="provider"
      label="Provider"
      value={providers}
      options={providerChoices}
      onChange={setProviders}
      inline={inline}
    />,
    <RateFilter
      key="rate"
      min={rateMin}
      max={rateMax}
      onMin={setRateMin}
      onMax={setRateMax}
      inline={inline}
    />,
    <ChipFilter
      key="source"
      label="Source"
      value={sources}
      options={sourceChoices}
      onChange={setSources}
      inline={inline}
    />,
  ]

  const clearButton = (
    <Button
      variant="ghost"
      className="h-11 pointer-fine:h-9"
      disabled={activeFilters === 0}
      onClick={clearFilters}
    >
      Clear filters
    </Button>
  )
  const activeBadge = activeFilters > 0 && (
    <Badge className="min-w-5 rounded-full px-1.5 tabular-nums" aria-hidden>
      {activeFilters}
    </Badge>
  )
  const filtersName = activeFilters === 0 ? 'Filters' : `Filters, ${String(activeFilters)} active`

  return (
    <div className="space-y-6">
      <PageHeader
        title="Market data"
        description="One entry per product, as the comparison engine sees it: a product read from the provider's page and from CCPC is one card, and CCPC's fixed terms are one card with a ladder. A check the engine counts as stale is in red. Open a source to compare the stored row and its history with the page; nothing here can be edited."
      />

      {market.isError && (
        <Alert variant="destructive">
          <AlertDescription>{market.error.message}</AlertDescription>
        </Alert>
      )}
      {market.isPending && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-hidden>
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      )}

      {market.data !== undefined && views.length === 0 && (
        <Empty className="border border-dashed py-16">
          <EmptyHeader>
            <EmptyTitle>No market data yet</EmptyTitle>
            <EmptyDescription>
              Run the refresh (npm run market:refresh in the backend) to read the provider sites.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {market.data !== undefined && views.length > 0 && (
        <div
          data-layout={layout}
          className={cn(
            layout === 'desk'
              ? 'grid grid-cols-[15rem_minmax(0,1fr)] items-start gap-6'
              : 'space-y-4',
          )}
        >
          {layout === 'phone' && (
            /* Sticks to the top of the console's scrolling pane, which starts under its top bar. */
            <div className="bg-background sticky top-0 z-10 flex items-center justify-between gap-3 border-b py-2">
              <p className="text-sm" aria-live="polite">
                {count}
              </p>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="h-11 shrink-0" aria-label={filtersName}>
                    <SlidersHorizontalIcon aria-hidden />
                    Filters
                    {activeBadge}
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="bottom"
                  // Its corner cross is a 16px target; "Show results", Escape and the overlay
                  // close it.
                  showCloseButton={false}
                  className="max-h-[85dvh] overflow-y-auto"
                >
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                    <SheetDescription>{summary.join(' · ')}</SheetDescription>
                  </SheetHeader>
                  <div className="space-y-5 px-4">{groups}</div>
                  <SheetFooter className="flex-row pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <Button
                      variant="outline"
                      className="h-11 flex-1"
                      disabled={activeFilters === 0}
                      onClick={clearFilters}
                    >
                      Clear
                    </Button>
                    <SheetClose asChild>
                      <Button className="h-11 flex-1">Show results</Button>
                    </SheetClose>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            </div>
          )}

          {layout === 'tablet' && (
            <section aria-label="Filters" className="bg-card rounded-xl border">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1">
                <Button
                  variant="ghost"
                  className="h-11 px-2"
                  aria-expanded={panelOpen}
                  aria-controls={panelId}
                  aria-label={filtersName}
                  onClick={() => {
                    setPanelOpen(!panelOpen)
                    writePanelOpen(!panelOpen)
                  }}
                >
                  {panelOpen ? <ChevronDownIcon aria-hidden /> : <ChevronRightIcon aria-hidden />}
                  <SlidersHorizontalIcon aria-hidden />
                  Filters
                  {activeBadge}
                </Button>
                <p className="text-muted-foreground min-w-0 flex-1 text-sm" aria-live="polite">
                  {summary.join(' · ')}
                </p>
                {clearButton}
              </div>
              {panelOpen && (
                <div id={panelId} className="space-y-3 border-t px-4 pt-3 pb-4">
                  {groups}
                </div>
              )}
            </section>
          )}

          {layout === 'desk' && (
            /* Sticky in the console's scrolling pane, and scrolls on its own when it is the
               taller of the two: the pane's height less its top bar and padding. */
            <aside
              aria-label="Filters"
              className="sticky top-0 max-h-[calc(100dvh-6.5rem)] space-y-5 overflow-y-auto pr-1 pb-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-medium">
                  Filters
                  {activeBadge}
                </h2>
                {clearButton}
              </div>
              <p className="text-muted-foreground -mt-3 text-sm" aria-live="polite">
                {summary.join(' · ')}
              </p>
              {groups}
            </aside>
          )}

          <section aria-label="Results" className="min-w-0 space-y-3">
            <p className="text-muted-foreground text-xs">
              Market as of {shortDate(market.data.asOf)}
              {/* CCPC's re-use terms ask for its attribution wherever its data is shown. */}
              {showsCcpc && <> · {CCPC_ATTRIBUTION}</>}
            </p>
            {shown.length === 0 && (
              <p className="text-muted-foreground text-sm">Nothing matches those filters.</p>
            )}
            {shown.length > 0 && (
              <ul
                aria-label="Products"
                data-columns={COLUMNS[layout]}
                className={cn('grid items-start', GRID[layout])}
              >
                {shown.map((view) => (
                  <ViewItem key={view.id} view={view} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

type Layout = 'phone' | 'tablet' | 'desk'

/** `md`: the console's sidebar becomes a drawer under it, so the two change together. */
const TABLET_FROM_PX = 768
/** `lg`: an iPad in landscape (1180) is a desk; in portrait (820) a tablet. */
const DESK_FROM_PX = 1024

const COLUMNS: Readonly<Record<Layout, number>> = { phone: 1, tablet: 2, desk: 3 }

/**
 * At most two or three columns, each at least 16rem: with the console's sidebar open the pane
 * can be too narrow for the most, and then it takes fewer rather than squeezing a card.
 */
const GRID: Readonly<Record<Layout, string>> = {
  phone: 'grid-cols-1 gap-3',
  tablet: 'gap-4 grid-cols-[repeat(auto-fill,minmax(max(16rem,calc((100%_-_1rem)/2)),1fr))]',
  desk: 'gap-4 grid-cols-[repeat(auto-fill,minmax(max(16rem,calc((100%_-_2rem)/3)),1fr))]',
}

function resultCount(shown: number, total: number): string {
  const noun = (n: number) => (n === 1 ? 'product' : 'products')
  return shown === total
    ? `${String(total)} ${noun(total)}`
    : `${String(shown)} of ${String(total)} ${noun(total)}`
}

function counted(n: number, one: string, many: string): string {
  return n === 0 ? '' : `${String(n)} ${n === 1 ? one : many}`
}

/** 44px for a finger, smaller under a mouse. */
const CHIP = 'h-11 px-4 pointer-fine:h-8 pointer-fine:px-3'

/** Multi-select: each toggle is on or off (`aria-pressed`); none on means every value. */
function ChipFilter({
  label,
  hint,
  value,
  options,
  onChange,
  inline,
}: {
  readonly label: string
  readonly hint?: string
  readonly value: readonly string[]
  readonly options: readonly Option[]
  readonly onChange: (value: readonly string[]) => void
  readonly inline: boolean
}): ReactNode {
  const hintId = useId()
  if (options.length === 0) return null
  return (
    <FilterGroup label={label} inline={inline}>
      <ToggleGroup
        type="multiple"
        variant="outline"
        size="sm"
        // Separate buttons that wrap, at every width.
        spacing={2}
        className="w-auto flex-wrap"
        value={[...value]}
        onValueChange={onChange}
        aria-label={label}
        aria-describedby={hint === undefined ? undefined : hintId}
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value} className={CHIP}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {hint !== undefined && (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
    </FilterGroup>
  )
}

/**
 * A filter's label and its controls: the label above, or beside them on a tablet's panel.
 * The label is visual; each control names itself (`aria-label`, `aria-labelledby`).
 */
function FilterGroup({
  label,
  labelId,
  inline,
  role,
  children,
}: {
  readonly label: string
  readonly labelId?: string
  readonly inline: boolean
  readonly role?: 'group'
  readonly children: ReactNode
}): ReactNode {
  return (
    <div
      role={role}
      aria-labelledby={role === undefined ? undefined : labelId}
      className={cn(
        'min-w-0',
        inline ? 'grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-3' : 'space-y-1.5',
      )}
    >
      <p
        id={labelId}
        className={cn('text-muted-foreground text-xs', inline && 'pt-3.5 pointer-fine:pt-2')}
      >
        {label}
      </p>
      <div className="min-w-0 space-y-1.5">{children}</div>
    </div>
  )
}

const PANEL_KEY = 'saoi.admin.market.filtersOpen'

/** A tablet's panel opens the way its viewer last left it; open the first time. */
function readPanelOpen(): boolean {
  try {
    return window.localStorage.getItem(PANEL_KEY) !== 'false'
  } catch {
    return true
  }
}

function writePanelOpen(open: boolean): void {
  try {
    window.localStorage.setItem(PANEL_KEY, String(open))
  } catch {
    // Private browsing and blocked storage both throw. The panel still folds this session.
  }
}

/** One of four orders; choosing the chosen one again keeps it. */
function SortControl({
  value,
  onChange,
  inline,
}: {
  readonly value: SortKey
  readonly onChange: (value: SortKey) => void
  readonly inline: boolean
}): ReactNode {
  return (
    <FilterGroup label="Sort" inline={inline}>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={2}
        className="w-auto flex-wrap"
        value={value}
        onValueChange={(next) => {
          const key = SORTS.find((sort) => sort === next)
          if (key !== undefined) onChange(key)
        }}
        aria-label="Sort"
      >
        {SORTS.map((sort) => (
          <ToggleGroupItem key={sort} value={sort} className={CHIP}>
            {SORT_LABELS[sort]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </FilterGroup>
  )
}

/** Bounds on each product's headline rate. A product with no rate stays only unbounded. */
function RateFilter({
  min,
  max,
  onMin,
  onMax,
  inline,
}: {
  readonly min: string
  readonly max: string
  readonly onMin: (value: string) => void
  readonly onMax: (value: string) => void
  readonly inline: boolean
}): ReactNode {
  const labelId = useId()
  return (
    <FilterGroup label="Rate" labelId={labelId} inline={inline} role="group">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <RateBound label="At least" value={min} onChange={onMin} />
        <RateBound label="At most" value={max} onChange={onMax} />
      </div>
    </FilterGroup>
  )
}

function RateBound({
  label,
  value,
  onChange,
}: {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
}): ReactNode {
  const id = useId()
  const errorId = useId()
  const invalid = value.trim() !== '' && parseRateBound(value) === null
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id} className="text-muted-foreground text-xs font-normal">
          {label}
        </Label>
        <div className="relative">
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            max="100"
            placeholder="any"
            className="h-11 w-24 pr-7 tabular-nums pointer-fine:h-9"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
          />
          <span
            className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm"
            aria-hidden
          >
            %
          </span>
        </div>
      </div>
      {invalid && (
        <p id={errorId} className="text-destructive text-xs">
          A percentage from 0 to 100
        </p>
      )}
    </div>
  )
}

function Lines({
  lines,
  stacked = false,
}: {
  readonly lines: readonly Line[]
  /** Label above value: for long labels and sentences in a narrow column. */
  readonly stacked?: boolean
}): ReactNode {
  return (
    <dl
      className={cn(
        'grid gap-x-3 text-sm',
        // A label is capped at 40% so a long one from the source wraps, rather than taking the
        // row and leaving its value one character wide.
        stacked ? 'grid-cols-1 gap-y-0' : 'grid-cols-[fit-content(40%)_1fr] gap-y-0.5',
      )}
    >
      {lines.map((line, index) => (
        <Fragment key={`${String(index)} ${line.label}`}>
          <dt className={cn('text-muted-foreground', stacked && 'mt-2 text-xs first:mt-0')}>
            {line.label}
          </dt>
          <dd className="min-w-0 break-words">{line.value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

function ExternalLink({
  url,
  children,
}: {
  readonly url: string
  readonly children: ReactNode
}): ReactNode {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      // 44px tall for a finger, where it is a thumb rather than a pointer.
      className="text-primary inline-flex min-h-11 items-center gap-1 text-sm underline-offset-4 hover:underline pointer-fine:min-h-0"
    >
      {children}
      <ExternalLinkIcon className="size-3" aria-hidden />
    </a>
  )
}

function Source({ row }: { readonly row: MarketProductVersion }): ReactNode {
  return (
    <div className="space-y-1">
      <Badge variant={row.source === 'ccpc' ? 'secondary' : 'outline'}>
        {SOURCE_LABELS[row.source]}
      </Badge>
      <div>
        <ExternalLink url={row.sourceUrl}>Open page</ExternalLink>
      </div>
      {row.providerUrl !== null && row.providerUrl !== row.sourceUrl && (
        <div>
          <ExternalLink url={row.providerUrl}>Provider page</ExternalLink>
        </div>
      )}
      {row.attribution !== null && (
        <p className="text-muted-foreground text-xs break-words">{row.attribution}</p>
      )}
    </div>
  )
}

/** The raw row behind a source: where it was read, its history, every field, the JSON. */
function Detail({
  group,
  row,
}: {
  readonly group: MarketGroup
  readonly row: MarketProductVersion
}): ReactNode {
  return (
    <div className="grid gap-6 @3xl:grid-cols-2">
      <section className="min-w-0 space-y-1">
        <h3 className="text-sm font-medium">Source</h3>
        <p className="text-sm break-words">
          {row.providerProductName} <code className="text-muted-foreground">{row.productId}</code>
        </p>
        <Source row={row} />
        {row.sourceUpdatedAt !== null && (
          <p className="text-muted-foreground text-xs">
            Edited at source {row.sourceUpdatedAt.slice(0, 10)}
          </p>
        )}
      </section>
      <section className="min-w-0 space-y-2">
        <h3 className="text-sm font-medium">As stored</h3>
        <Lines
          lines={[
            ...ratesLines(row.rates),
            ...conditionsLines(row.conditions),
            ...[unknownLine(row.unknown)].filter((line): line is Line => line !== null),
          ]}
        />
      </section>
      <section className="min-w-0 space-y-2">
        <h3 className="text-sm font-medium">History</h3>
        <ol className="space-y-3 text-sm">
          {group.versions.map((version, index) => {
            const older = group.versions[index + 1]
            const changes = older === undefined ? [] : describeChange(older, version)
            return (
              <li key={version.firstSeenAt} className="space-y-1">
                <div>
                  <span className="font-medium">{version.firstSeenAt.slice(0, 10)}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    {version.supersededAt === null
                      ? 'to now'
                      : `to ${version.supersededAt.slice(0, 10)}`}
                  </span>
                </div>
                {older === undefined ? (
                  <p className="text-muted-foreground">First seen.</p>
                ) : (
                  <ul className="text-muted-foreground list-disc pl-5 break-words">
                    {changes.length === 0 ? (
                      <li>Nothing changed in the fields shown.</li>
                    ) : (
                      changes.map((change) => <li key={change}>{change}</li>)
                    )}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
      </section>
      {detailLines(row.conditions).length > 0 && (
        <section className="min-w-0 space-y-2">
          <h3 className="text-sm font-medium">Every field the source states</h3>
          <Lines lines={detailLines(row.conditions)} stacked />
        </section>
      )}
      <section className="min-w-0 space-y-2">
        <h3 className="text-sm font-medium">Raw JSON (current version)</h3>
        <Code
          language="json"
          text={JSON.stringify({ rates: row.rates, conditions: row.conditions }, null, 2)}
        />
      </section>
    </div>
  )
}

/**
 * A source's raw row, loaded with every version the first time any source is opened (the
 * same call the screen used to make up front), then shared from the cache.
 */
function SourceDetail({ source }: { readonly source: MarketViewSource }): ReactNode {
  const raw = useQuery({
    queryKey: queryKeys.admin.marketProducts(),
    queryFn: () => adminApi.listMarketProducts(),
  })
  const groups = useMemo(() => groupVersions(raw.data?.items ?? []), [raw.data])
  if (raw.isPending) return <Skeleton className="h-32" />
  if (raw.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{raw.error.message}</AlertDescription>
      </Alert>
    )
  }
  const group = findRawGroup(groups, source)
  const row = group?.current ?? group?.versions[0]
  if (group === undefined || row === undefined) {
    return (
      <p className="text-muted-foreground text-sm">
        The stored row <code>{source.rowId}</code> is not in the market data
        {raw.data.skipped > 0
          ? ` (${String(raw.data.skipped)} stored versions no longer match the schema and are left out)`
          : ''}
        .
      </p>
    )
  }
  return (
    // The container Detail's `@3xl:grid-cols-2` measures: two columns in a wide card.
    <div className="@container">
      <Detail group={group} row={row} />
    </div>
  )
}

/** A card opened on a source spans the row, so the raw row and its history have the room. */
function ViewItem({ view }: { readonly view: MarketView }): ReactNode {
  const [openSource, setOpenSource] = useState<string | null>(null)
  return (
    <li className={cn('min-w-0', openSource !== null && 'col-span-full')}>
      <ViewCard view={view} openSource={openSource} onOpenSource={setOpenSource} />
    </li>
  )
}

/**
 * One product: who and what, the headline rate, the rate lines and a ladder, the conditions a
 * tap away, the dates, and the sources it was read from. Every toggle is a real button.
 */
function ViewCard({
  view,
  openSource,
  onOpenSource,
}: {
  readonly view: MarketView
  readonly openSource: string | null
  readonly onOpenSource: (key: string | null) => void
}): ReactNode {
  const [conditionsOpen, setConditionsOpen] = useState(false)
  const conditionsId = useId()
  const detailId = useId()
  const conditions: Line[] = [
    ...view.conditions,
    ...(view.unknown.length > 0 ? [{ label: 'Not stated', value: view.unknown.join(', ') }] : []),
  ]
  const ConditionsChevron = conditionsOpen ? ChevronDownIcon : ChevronRightIcon
  const quiet = [view.categoryLabel, view.termLabel, view.access].filter(
    (part): part is string => part !== null && part !== '',
  )
  const opened = view.sources.find((source) => sourceKey(source) === openSource)
  const sourceLabel = (source: MarketViewSource): string => {
    const same = view.sources.filter((s) => s.source === source.source)
    const label = SOURCE_LABELS[source.source]
    return same.length > 1 ? `${label} ${String(same.indexOf(source) + 1)}` : label
  }

  return (
    <Card className="gap-3 py-4">
      <div className="flex items-start justify-between gap-3 px-4">
        <h2 className="min-w-0 leading-snug break-words">
          <span className="text-muted-foreground block text-xs">{view.providerName}</span>
          <span className="block font-medium">{view.name}</span>
        </h2>
        {view.headline.label !== '' && (
          <p className="shrink-0 text-right text-lg leading-tight font-semibold tabular-nums">
            {view.headline.label}
          </p>
        )}
      </div>

      <div className="-mt-1 flex flex-wrap items-center gap-2 px-4">
        <p className="text-muted-foreground text-xs break-words">{quiet.join(' · ')}</p>
        {view.retired && <Badge variant="secondary">gone from the source</Badge>}
      </div>

      {view.lines.length > 0 && (
        <ul className="space-y-0.5 px-4 text-sm break-words">
          {view.lines.map((line, index) => (
            <li key={`${String(index)} ${line}`}>{line}</li>
          ))}
        </ul>
      )}

      {view.ladder.length > 0 && (
        <ul aria-label="Terms" className="flex flex-wrap gap-1.5 px-4">
          {view.ladder.map((rung) => (
            <li
              key={rung.months}
              className="bg-muted rounded-md px-2 py-0.5 text-xs whitespace-nowrap tabular-nums"
            >
              <span className="text-muted-foreground">{shortTerm(rung.months)}</span>{' '}
              {String(rung.ratePct)}%
            </li>
          ))}
        </ul>
      )}

      {conditions.length > 0 && (
        <div className="min-w-0 px-2">
          <Button
            variant="ghost"
            className="h-11 w-full justify-start px-2 pointer-fine:h-8"
            aria-expanded={conditionsOpen}
            aria-controls={conditionsId}
            onClick={() => setConditionsOpen((was) => !was)}
          >
            <ConditionsChevron aria-hidden />
            Conditions ({conditions.length})
          </Button>
          {conditionsOpen && (
            <div id={conditionsId} className="px-2 pb-1">
              <Lines lines={conditions} stacked />
            </div>
          )}
        </div>
      )}

      <p className="text-muted-foreground px-4 text-xs">
        <span className={cn(view.stale && 'text-destructive font-medium')}>
          Checked {shortDate(view.checkedAt)}
          {view.stale && ' (stale)'}
        </span>
        {' · '}
        {view.lastChangedAt === null
          ? 'No change recorded'
          : `Changed ${shortDate(view.lastChangedAt)}`}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 border-t px-4 pt-3">
        <span className="text-muted-foreground mr-1 text-xs">Sources</span>
        {view.sources.map((source) => {
          const key = sourceKey(source)
          const open = key === openSource
          return (
            <Button
              key={key}
              variant={open ? 'secondary' : 'outline'}
              size="sm"
              className="h-11 rounded-full px-3 text-xs pointer-fine:h-7"
              aria-expanded={open}
              aria-controls={open ? detailId : undefined}
              onClick={() => onOpenSource(open ? null : key)}
            >
              {sourceLabel(source)}
            </Button>
          )
        })}
      </div>

      {opened !== undefined && (
        <div
          id={detailId}
          role="region"
          aria-label={`${sourceLabel(opened)} row`}
          className="border-t px-4 pt-3"
        >
          <SourceDetail source={opened} />
        </div>
      )}
    </Card>
  )
}
