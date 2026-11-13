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
import { Card, CardContent } from '@/components/ui/card'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Code } from '@/components/Code'
import { PageHeader } from '@/admin/parts'
import { adminApi } from '@/admin/adminClient'
import {
  checkedAge,
  conditionsLines,
  describeChange,
  detailLines,
  byRateDescending,
  groupVersions,
  headlineRate,
  parseRateBound,
  ratesLines,
  SOURCE_LABELS,
  STALE_AFTER_DAYS,
  unknownLine,
  withinRate,
  type Line,
  type MarketGroup,
  type RateBounds,
} from '@/admin/marketFormat'
import { queryKeys } from '@/lib/queryKeys'
import { useIsNarrow } from '@/lib/useIsNarrow'
import { cn } from '@/lib/utils'
import type { MarketProductVersion } from '@contracts/market.ts'

/**
 * Market data: what Saoi has read off bank websites and the CCPC comparison tables, laid out so
 * a person can hold it against the page it came from. Read-only. The rows are the stored
 * versions; the current one is what the source says now, and the older ones are what each
 * product said before. A CCPC row carries CCPC's attribution, which is shown with it.
 *
 * Two layouts from the same groups: the desk gets the table, and a phone (under `md`, where the
 * console's sidebar also folds away) gets one card per product with the filters in a sheet.
 * The table at 60rem behind a sideways scroll was unreadable at 390px.
 */
export function MarketScreen(): ReactNode {
  const phone = useIsNarrow(PHONE_BELOW_PX)
  const market = useQuery({
    queryKey: queryKeys.admin.marketProducts(),
    queryFn: () => adminApi.listMarketProducts(),
  })
  // Each filter is a set of chosen values; none chosen means every value.
  const [provider, setProvider] = useState<readonly string[]>([])
  const [source, setSource] = useState<readonly string[]>([])
  const [category, setCategory] = useState<readonly string[]>([])
  const [rateMin, setRateMin] = useState('')
  const [rateMax, setRateMax] = useState('')
  const [byRate, setByRate] = useState(false)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())

  const groups = useMemo(() => groupVersions(market.data?.items ?? []), [market.data])
  const providers = useMemo(() => unique(groups.map((g) => g.versions[0]?.provider)), [groups])
  const categories = useMemo(() => unique(groups.map((g) => g.versions[0]?.category)), [groups])
  const sources = useMemo(() => unique(groups.map((g) => g.versions[0]?.source)), [groups])
  const bounds: RateBounds = { min: parseRateBound(rateMin), max: parseRateBound(rateMax) }
  const rateBounded = bounds.min !== null || bounds.max !== null
  const rateOf = (g: MarketGroup) => {
    const row = g.current ?? g.versions[0]
    return row === undefined ? null : headlineRate(row.rates)
  }
  const matching = groups.filter((g) => {
    const row = g.current ?? g.versions[0]
    return (
      row !== undefined &&
      chosen(provider, row.provider) &&
      chosen(source, row.source) &&
      chosen(category, row.category) &&
      withinRate(headlineRate(row.rates), bounds)
    )
  })
  const shown = byRate ? byRateDescending(matching, rateOf) : matching
  const now = new Date()
  // Each source's re-use terms ask for its attribution wherever its data is shown.
  const attributions = unique(
    shown.map((g) => (g.current ?? g.versions[0])?.attribution ?? undefined),
  )

  const activeFilters =
    [provider, source, category].filter((values) => values.length > 0).length +
    (rateBounded ? 1 : 0) +
    (byRate ? 1 : 0)
  const clearFilters = () => {
    setProvider([])
    setSource([])
    setCategory([])
    setRateMin('')
    setRateMax('')
    setByRate(false)
  }
  const selected = [
    counted(source.length, 'source', 'sources'),
    counted(provider.length, 'provider', 'providers'),
    counted(category.length, 'category', 'categories'),
  ].filter((part) => part !== '')
  const filters = (
    <>
      <Filter
        label="Source"
        value={source}
        options={sources}
        onChange={setSource}
        labelFor={(option) => SOURCE_LABELS[option as keyof typeof SOURCE_LABELS] ?? option}
      />
      <Filter label="Provider" value={provider} options={providers} onChange={setProvider} />
      <Filter label="Category" value={category} options={categories} onChange={setCategory} />
      <RateFilter
        min={rateMin}
        max={rateMax}
        byRate={byRate}
        onMin={setRateMin}
        onMax={setRateMax}
        onByRate={setByRate}
      />
    </>
  )

  const toggle = (key: string) =>
    setOpen((previous) => {
      const next = new Set(previous)
      if (!next.delete(key)) next.add(key)
      return next
    })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Market data"
        description={`Rates and conditions read from provider websites and the CCPC comparison tables. A check older than ${String(STALE_AFTER_DAYS)} days is highlighted. Compare each row with its source page; nothing here can be edited.`}
      />

      {market.isError && (
        <Alert variant="destructive">
          <AlertDescription>{market.error.message}</AlertDescription>
        </Alert>
      )}
      {market.isPending && <Skeleton className="h-48" />}

      {market.data !== undefined && market.data.skipped > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            {market.data.skipped} stored version(s) no longer match the schema and are not shown.
          </AlertDescription>
        </Alert>
      )}

      {market.data !== undefined && groups.length === 0 && (
        <Empty className="border border-dashed py-16">
          <EmptyHeader>
            <EmptyTitle>No market data yet</EmptyTitle>
            <EmptyDescription>
              Run the refresh (npm run market:refresh in the backend) to read the provider sites.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {groups.length > 0 && !phone && (
        <div className="flex flex-wrap items-end gap-4">
          {filters}
          {activeFilters > 0 && (
            <Button variant="ghost" className="h-11" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      {groups.length > 0 && phone && (
        /* Sticks to the top of the console's scrolling pane, which starts under its top bar. */
        <div className="bg-background sticky top-0 z-10 flex items-center justify-between gap-3 border-b py-2">
          <p className="text-sm" aria-live="polite">
            {resultCount(shown.length, groups.length)}
          </p>
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                className="h-11 shrink-0"
                aria-label={
                  activeFilters === 0 ? 'Filters' : `Filters, ${String(activeFilters)} active`
                }
              >
                <SlidersHorizontalIcon aria-hidden />
                Filters
                {activeFilters > 0 && (
                  <Badge className="min-w-5 rounded-full px-1.5 tabular-nums" aria-hidden>
                    {activeFilters}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              // Its corner cross is a 16px target; "Show results", Escape and the overlay close it.
              showCloseButton={false}
              className="max-h-[85dvh] overflow-y-auto"
            >
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription>
                  {[resultCount(shown.length, groups.length), ...selected].join(' · ')}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4">{filters}</div>
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

      {attributions.map((attribution) => (
        <p key={attribution} className="text-muted-foreground text-sm">
          {attribution}
        </p>
      ))}

      {groups.length > 0 && shown.length === 0 && (
        <p className="text-muted-foreground text-sm">Nothing matches those filters.</p>
      )}

      {shown.length > 0 && phone && (
        <ul className="space-y-3" aria-label="Products">
          {shown.map((group) => (
            <li key={group.key}>
              <ProductCard
                group={group}
                now={now}
                expanded={open.has(group.key)}
                onToggle={() => toggle(group.key)}
              />
            </li>
          ))}
        </ul>
      )}

      {shown.length > 0 && !phone && (
        <Card className="py-0">
          <CardContent className="overflow-x-auto px-0">
            {/* Fixed layout with set widths: the bonus conditions are long sentences, and under
                auto layout with shadcn's nowrap cells they stretched the table sideways. */}
            <Table className="min-w-[60rem] table-fixed">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[21%]" />
                <col className="w-[31%]" />
                <col className="w-[11%]" />
                <col className="w-[17%]" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Rates</TableHead>
                  <TableHead>Conditions</TableHead>
                  <TableHead>Checked</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((group) => (
                  <GroupRows
                    key={group.key}
                    group={group}
                    now={now}
                    expanded={open.has(group.key)}
                    onToggle={() => toggle(group.key)}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/** `md`: the console's sidebar becomes a drawer here too, so the two change together. */
const PHONE_BELOW_PX = 768

function resultCount(shown: number, total: number): string {
  const noun = (n: number) => (n === 1 ? 'product' : 'products')
  return shown === total
    ? `${String(total)} ${noun(total)}`
    : `${String(shown)} of ${String(total)} ${noun(total)}`
}

function unique(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => v !== undefined))].sort()
}

/** A value passes a filter when nothing is chosen in it, or the value is among those chosen. */
function chosen(values: readonly string[], value: string): boolean {
  return values.length === 0 || values.includes(value)
}

function counted(n: number, one: string, many: string): string {
  return n === 0 ? '' : `${String(n)} ${n === 1 ? one : many}`
}

/** Multi-select: each toggle is on or off (`aria-pressed`); none on means every value. */
function Filter({
  label,
  value,
  options,
  onChange,
  labelFor = (option) => option,
}: {
  readonly label: string
  readonly value: readonly string[]
  readonly options: readonly string[]
  readonly onChange: (value: readonly string[]) => void
  readonly labelFor?: (option: string) => string
}): ReactNode {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <ToggleGroup
        type="multiple"
        variant="outline"
        size="sm"
        // Separate 44px buttons that wrap, at every width: a joined strip of a dozen providers
        // ran past the card edge on the desk and could not be tapped on a phone.
        spacing={2}
        className="flex-wrap"
        value={[...value]}
        onValueChange={onChange}
        aria-label={label}
      >
        {options.map((option) => (
          <ToggleGroupItem key={option} value={option} className="h-11 px-4">
            {labelFor(option)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

/**
 * Bounds on each product's headline rate and a sort by it. A product with no rate stays only
 * while neither bound is set.
 */
function RateFilter({
  min,
  max,
  byRate,
  onMin,
  onMax,
  onByRate,
}: {
  readonly min: string
  readonly max: string
  readonly byRate: boolean
  readonly onMin: (value: string) => void
  readonly onMax: (value: string) => void
  readonly onByRate: (value: boolean) => void
}): ReactNode {
  const labelId = useId()
  return (
    <div className="space-y-1" role="group" aria-labelledby={labelId}>
      <p id={labelId} className="text-muted-foreground text-xs">
        Rate
      </p>
      <div className="flex flex-wrap items-start gap-2">
        <RateBound label="At least" value={min} onChange={onMin} />
        <RateBound label="At most" value={max} onChange={onMax} />
        <Toggle
          variant="outline"
          size="sm"
          className="h-11 px-4"
          pressed={byRate}
          onPressedChange={onByRate}
        >
          Highest rate first
        </Toggle>
      </div>
    </div>
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
            className="h-11 w-24 pr-7 tabular-nums"
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
  /** Label above value: for long labels and sentences in a phone-width column. */
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

function Checked({
  checkedAt,
  sourceUpdatedAt,
  now,
}: {
  readonly checkedAt: string
  readonly sourceUpdatedAt: string | null
  readonly now: Date
}): ReactNode {
  const age = checkedAge(checkedAt, now)
  return (
    <div className="space-y-1">
      <div className="whitespace-nowrap">{checkedAt.slice(0, 10)}</div>
      {/* Wraps inside the narrow Checked column rather than running over the Source links. */}
      <Badge
        variant={age.stale ? 'destructive' : 'outline'}
        className="max-w-full whitespace-normal"
      >
        {age.label}
        {age.stale ? ' (stale)' : ''}
      </Badge>
      {sourceUpdatedAt !== null && (
        <div className="text-muted-foreground">edited at source {sourceUpdatedAt.slice(0, 10)}</div>
      )}
    </div>
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
      // 44px tall under `md`, where it is a thumb rather than a pointer.
      className="text-primary inline-flex min-h-11 items-center gap-1 text-sm underline-offset-4 hover:underline md:min-h-0"
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

function GroupRows({
  group,
  now,
  expanded,
  onToggle,
}: {
  readonly group: MarketGroup
  readonly now: Date
  readonly expanded: boolean
  readonly onToggle: () => void
}): ReactNode {
  const row = group.current ?? group.versions[0]
  if (row === undefined) return null
  const retired = group.current === undefined
  const Chevron = expanded ? ChevronDownIcon : ChevronRightIcon

  return (
    <>
      <TableRow>
        <TableCell className="align-top whitespace-normal">
          <div className="font-medium">{row.providerProductName}</div>
          <div className="text-muted-foreground text-xs">
            {row.provider} · {row.category} · <code>{row.productId}</code>
          </div>
          {row.effectiveFrom !== null && (
            <div className="text-muted-foreground text-xs">from {row.effectiveFrom}</div>
          )}
          {retired && <Badge variant="secondary">gone from the source</Badge>}
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 mt-1"
              aria-expanded={expanded}
              onClick={onToggle}
            >
              <Chevron />
              Details and history ({group.versions.length})
            </Button>
          </div>
        </TableCell>
        <TableCell className="align-top whitespace-normal">
          <Lines lines={ratesLines(row.rates)} />
        </TableCell>
        <TableCell className="align-top whitespace-normal">
          <Lines
            lines={[
              ...conditionsLines(row.conditions),
              ...[unknownLine(row.unknown)].filter((line): line is Line => line !== null),
            ]}
          />
        </TableCell>
        <TableCell className="align-top text-xs whitespace-normal">
          <Checked checkedAt={row.checkedAt} sourceUpdatedAt={row.sourceUpdatedAt} now={now} />
        </TableCell>
        <TableCell className="align-top whitespace-normal">
          <Source row={row} />
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={5} className="bg-muted/30 whitespace-normal">
            {/* The container Detail's `@3xl:grid-cols-2` measures: two columns on a wide row. */}
            <div className="@container">
              <Detail group={group} row={row} />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function Detail({
  group,
  row,
  Heading = 'h2',
  withSource = false,
}: {
  readonly group: MarketGroup
  readonly row: MarketProductVersion
  /** `h3` inside a card, whose own title is the `h2`. */
  readonly Heading?: 'h2' | 'h3'
  /** The card has no Source column, so its open state carries the links. */
  readonly withSource?: boolean
}): ReactNode {
  return (
    <div className="grid gap-6 @3xl:grid-cols-2">
      {withSource && (
        <section className="min-w-0 space-y-1">
          <Heading className="text-sm font-medium">Source</Heading>
          <Source row={row} />
          {row.sourceUpdatedAt !== null && (
            <p className="text-muted-foreground text-xs">
              Edited at source {row.sourceUpdatedAt.slice(0, 10)}
            </p>
          )}
        </section>
      )}
      <section className="min-w-0 space-y-2">
        <Heading className="text-sm font-medium">History</Heading>
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
          <Heading className="text-sm font-medium">Every field the source states</Heading>
          <Lines lines={detailLines(row.conditions)} stacked={Heading === 'h3'} />
        </section>
      )}
      <section className="min-w-0 space-y-2">
        <Heading className="text-sm font-medium">Raw JSON (current version)</Heading>
        <Code
          language="json"
          text={JSON.stringify({ rates: row.rates, conditions: row.conditions }, null, 2)}
        />
      </section>
    </div>
  )
}

/**
 * One product on a phone: what it pays up front, the conditions a tap away, and the detail and
 * history as the card's open state. Every toggle is a real button, 44px tall.
 */
function ProductCard({
  group,
  now,
  expanded,
  onToggle,
}: {
  readonly group: MarketGroup
  readonly now: Date
  readonly expanded: boolean
  readonly onToggle: () => void
}): ReactNode {
  const [conditionsOpen, setConditionsOpen] = useState(false)
  const conditionsId = useId()
  const detailId = useId()
  const row = group.current ?? group.versions[0]
  if (row === undefined) return null
  const retired = group.current === undefined
  const age = checkedAge(row.checkedAt, now)
  const conditions = [
    ...conditionsLines(row.conditions),
    ...[unknownLine(row.unknown)].filter((line): line is Line => line !== null),
  ]
  const Chevron = expanded ? ChevronDownIcon : ChevronRightIcon
  const ConditionsChevron = conditionsOpen ? ChevronDownIcon : ChevronRightIcon

  return (
    <Card className="gap-3 pt-4 pb-1">
      <div className="min-w-0 space-y-1 px-4">
        <h2 className="leading-snug break-words">
          <span className="text-muted-foreground block text-xs">{row.provider}</span>
          <span className="block font-medium">{row.providerProductName}</span>
        </h2>
        <p className="text-muted-foreground text-xs break-words">
          {row.category} · {SOURCE_LABELS[row.source]}
          {row.effectiveFrom !== null && ` · from ${row.effectiveFrom}`}
        </p>
        {retired && <Badge variant="secondary">gone from the source</Badge>}
      </div>

      <div className="min-w-0 px-4">
        <Lines lines={ratesLines(row.rates)} />
      </div>

      {conditions.length > 0 && (
        <div className="min-w-0 px-2">
          <Button
            variant="ghost"
            className="h-11 w-full justify-start px-2"
            aria-expanded={conditionsOpen}
            aria-controls={conditionsId}
            onClick={() => setConditionsOpen((was) => !was)}
          >
            <ConditionsChevron aria-hidden />
            Conditions
          </Button>
          {conditionsOpen && (
            <div id={conditionsId} className="px-2 pb-1">
              <Lines lines={conditions} stacked />
            </div>
          )}
        </div>
      )}

      <p className="text-muted-foreground px-4 text-xs">
        Checked {row.checkedAt.slice(0, 10)}
        {age.stale && <span className="text-destructive font-medium"> ({age.label}, stale)</span>}
        {' · '}
        {group.versions.length > 1 ? 'Changed' : 'First seen'} {row.firstSeenAt.slice(0, 10)}
      </p>

      <div className="min-w-0 border-t px-2 pt-1">
        <Button
          variant="ghost"
          className="h-11 w-full justify-start px-2"
          aria-expanded={expanded}
          aria-controls={detailId}
          onClick={onToggle}
        >
          <Chevron aria-hidden />
          Details and history ({group.versions.length})
        </Button>
        {expanded && (
          <div id={detailId} className="px-2 pt-2 pb-3">
            <Detail group={group} row={row} Heading="h3" withSource />
          </div>
        )}
      </div>
    </Card>
  )
}
