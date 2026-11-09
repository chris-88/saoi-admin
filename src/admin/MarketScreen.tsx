import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDownIcon, ChevronRightIcon, ExternalLinkIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Code } from '@/components/Code'
import { PageHeader } from '@/admin/parts'
import { adminApi } from '@/admin/adminClient'
import {
  checkedAge,
  conditionsLines,
  describeChange,
  detailLines,
  groupVersions,
  ratesLines,
  SOURCE_LABELS,
  STALE_AFTER_DAYS,
  unknownLine,
  type Line,
  type MarketGroup,
} from '@/admin/marketFormat'
import { queryKeys } from '@/lib/queryKeys'
import type { MarketProductVersion } from '@contracts/market.ts'

/**
 * Market data: what Saoi has read off bank websites and the CCPC comparison tables, laid out so
 * a person can hold it against the page it came from. Read-only. The rows are the stored
 * versions; the current one is what the source says now, and the older ones are what each
 * product said before. A CCPC row carries CCPC's attribution, which is shown with it.
 */
export function MarketScreen(): ReactNode {
  const market = useQuery({
    queryKey: queryKeys.admin.marketProducts(),
    queryFn: () => adminApi.listMarketProducts(),
  })
  const [provider, setProvider] = useState('all')
  const [source, setSource] = useState('all')
  const [category, setCategory] = useState('all')
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())

  const groups = useMemo(() => groupVersions(market.data?.items ?? []), [market.data])
  const providers = useMemo(() => unique(groups.map((g) => g.versions[0]?.provider)), [groups])
  const categories = useMemo(() => unique(groups.map((g) => g.versions[0]?.category)), [groups])
  const sources = useMemo(() => unique(groups.map((g) => g.versions[0]?.source)), [groups])
  const shown = groups.filter((g) => {
    const row = g.current ?? g.versions[0]
    return (
      row !== undefined &&
      (provider === 'all' || row.provider === provider) &&
      (source === 'all' || row.source === source) &&
      (category === 'all' || row.category === category)
    )
  })
  const now = new Date()
  // Each source's re-use terms ask for its attribution wherever its data is shown.
  const attributions = unique(
    shown.map((g) => (g.current ?? g.versions[0])?.attribution ?? undefined),
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

      {groups.length > 0 && (
        <div className="flex flex-wrap gap-4">
          <Filter
            label="Source"
            value={source}
            options={sources}
            onChange={setSource}
            labelFor={(option) => SOURCE_LABELS[option as keyof typeof SOURCE_LABELS] ?? option}
          />
          <Filter label="Provider" value={provider} options={providers} onChange={setProvider} />
          <Filter label="Category" value={category} options={categories} onChange={setCategory} />
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

      {shown.length > 0 && (
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

function unique(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => v !== undefined))].sort()
}

function Filter({
  label,
  value,
  options,
  onChange,
  labelFor = (option) => option,
}: {
  readonly label: string
  readonly value: string
  readonly options: readonly string[]
  readonly onChange: (value: string) => void
  readonly labelFor?: (option: string) => string
}): ReactNode {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={value}
        // Radix clears a single group when the pressed item is pressed again; keep one chosen.
        onValueChange={(next) => onChange(next === '' ? 'all' : next)}
        aria-label={label}
      >
        {['all', ...options].map((option) => (
          <ToggleGroupItem key={option} value={option}>
            {option === 'all' ? 'All' : labelFor(option)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

function Lines({ lines }: { readonly lines: readonly Line[] }): ReactNode {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
      {lines.map((line, index) => (
        <Fragment key={`${String(index)} ${line.label}`}>
          <dt className="text-muted-foreground">{line.label}</dt>
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
      <Badge variant={age.stale ? 'destructive' : 'outline'}>
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
      className="text-primary inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
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
            <Detail group={group} row={row} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function Detail({
  group,
  row,
}: {
  readonly group: MarketGroup
  readonly row: MarketProductVersion
}): ReactNode {
  return (
    <div className="grid gap-6 @3xl:grid-cols-2">
      <section className="min-w-0 space-y-2">
        <h2 className="text-sm font-medium">History</h2>
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
                  <ul className="text-muted-foreground list-disc pl-5">
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
          <h2 className="text-sm font-medium">Every field the source states</h2>
          <Lines lines={detailLines(row.conditions)} />
        </section>
      )}
      <section className="min-w-0 space-y-2">
        <h2 className="text-sm font-medium">Raw JSON (current version)</h2>
        <Code
          language="json"
          text={JSON.stringify({ rates: row.rates, conditions: row.conditions }, null, 2)}
        />
      </section>
    </div>
  )
}
