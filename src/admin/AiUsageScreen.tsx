import { useMemo, type ReactNode } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MetricCard, PageHeader } from '@/admin/parts'
import { adminApi } from '@/admin/adminClient'
import { queryKeys } from '@/lib/queryKeys'
import { HOST_LABELS, askedText, callTime, figureLabel, toolLabel } from '@/admin/aiUsageFormat'
import type { AiUsage, AiUsageCall, Period } from '@contracts/admin.ts'
import { MCP_HOSTS, type McpHost } from '@contracts/telemetry.ts'

/**
 * One colour per assistant, from the chart tokens; the same in every panel. The two teals
 * (`--chart-1`, `--chart-2`) are kept apart, so Claude and ChatGPT side by side are told apart.
 */
const hostConfig = {
  claude: { label: HOST_LABELS.claude, color: 'var(--chart-1)' },
  chatgpt: { label: HOST_LABELS.chatgpt, color: 'var(--chart-3)' },
  gemini: { label: HOST_LABELS.gemini, color: 'var(--chart-4)' },
  cursor: { label: HOST_LABELS.cursor, color: 'var(--chart-5)' },
  other: { label: HOST_LABELS.other, color: 'var(--chart-2)' },
} satisfies ChartConfig

/**
 * Who calls Saoi from their own AI, and how far it goes (design
 * `2026-11-14-saoi-ai-usage-analytics-design`).
 *
 * Every figure is a row the MCP server recorded or something that happened to the plan its
 * result held: the link opened, the plan claimed, the case signed in, a product chosen. The
 * recent calls come fifty at a time; the rest of the payload is the same on every page, so the
 * first page's is the one shown.
 */
export function AiUsageScreen({ period }: { readonly period: Period }): ReactNode {
  const usage = useInfiniteQuery({
    queryKey: queryKeys.admin.aiUsage(period),
    queryFn: ({ pageParam }) => adminApi.aiUsage(period, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

  const first = usage.data?.pages[0]
  const recent = useMemo(() => usage.data?.pages.flatMap((page) => page.recent) ?? [], [usage.data])

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI usage"
        description="Calls to Saoi from people's own assistants, recorded by the MCP server: which assistant, which tool, what was asked (figures in bands), and how far the link went."
      />

      {usage.isError && (
        <Alert variant="destructive">
          <AlertDescription>{usage.error.message}</AlertDescription>
        </Alert>
      )}

      {usage.isPending && <Loading />}

      {first !== undefined && (
        <Panels
          data={first}
          recent={recent}
          more={
            usage.hasNextPage
              ? {
                  loading: usage.isFetchingNextPage,
                  load: () => {
                    void usage.fetchNextPage()
                  },
                }
              : null
          }
        />
      )}
    </div>
  )
}

type More = { readonly loading: boolean; readonly load: () => void } | null

function Panels({
  data,
  recent,
  more,
}: {
  readonly data: AiUsage
  readonly recent: readonly AiUsageCall[]
  readonly more: More
}): ReactNode {
  const { totals, previous } = data

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
        <MetricCard
          label="Calls"
          value={totals.calls}
          previous={previous?.calls}
          note={`Tool calls, prompts and reads, from ${String(totals.sessions)} ${totals.sessions === 1 ? 'conversation' : 'conversations'} (address, assistant and day, hashed).`}
        />
        <MetricCard
          label="Cards shown"
          value={totals.cardsShown}
          previous={previous?.cardsShown}
          note="A result went back with its card, not held by the gate."
        />
        <MetricCard
          label="Links opened"
          value={totals.linksOpened}
          previous={previous?.linksOpened}
          note={`Of ${String(totals.plansSaved)} ${totals.plansSaved === 1 ? 'plan' : 'plans'} held behind a link.`}
        />
        <MetricCard
          label="Product chosen"
          value={totals.chosen}
          previous={previous?.chosen}
          note={`${String(totals.claimed)} claimed into the app, ${String(totals.signedIn)} signed in.`}
        />
      </div>

      {totals.calls === 0 ? (
        <Empty className="border border-dashed py-16">
          <EmptyHeader>
            <EmptyTitle>No AI has called Saoi in this window</EmptyTitle>
            <EmptyDescription>
              Counted from {data.from.slice(0, 10)} to {data.to.slice(0, 10)}. Once Claude, ChatGPT
              or another assistant uses the Saoi connector, its calls, the funnel from a call to a
              product chosen, and what was asked will appear here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Panel
            title="The link funnel, by assistant"
            description="Each step counts the calls in this window that got that far: a card shown, a plan held behind a link, the link opened, the plan claimed in the app, signed in, a product chosen."
          >
            <Funnel funnel={data.funnel} />
          </Panel>

          <Panel
            title="Calls a day"
            description={`By assistant, ${data.from.slice(0, 10)} to ${data.to.slice(0, 10)} (UTC days).`}
          >
            <Daily series={data.series} />
          </Panel>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Panel
              title="Tools"
              description="Calls, errors, how often the gate held the card back, and the median time."
              scroll
            >
              <Tools tools={data.tools} />
            </Panel>

            <Panel
              title="What the gate held back"
              description="The figures the home calculator was still waiting for when it asked instead of showing the card."
            >
              <GateMissing figures={data.gateMissing} />
            </Panel>
          </div>

          <Panel
            title="Recent calls"
            description="Newest first. Figures are bands; search words and product ids are as the assistant sent them."
            scroll
          >
            <Recent calls={recent} more={more} />
          </Panel>

          <UserAgents agents={data.userAgents} />
        </>
      )}
    </>
  )
}

/** One bar per step, one colour per assistant: where each assistant's calls stop. */
function Funnel({ funnel }: { readonly funnel: AiUsage['funnel'] }): ReactNode {
  const hosts = funnel.map((entry) => entry.host)
  const rows = useMemo(() => {
    const steps = funnel[0]?.steps ?? []
    return steps.map((step, index) => ({
      label: step.label,
      ...Object.fromEntries(funnel.map((entry) => [entry.host, entry.steps[index]?.count ?? 0])),
    }))
  }, [funnel])

  return (
    <ChartContainer
      config={hostConfig}
      className="w-full"
      style={{ height: rows.length * (hosts.length * 10 + 18) + 48 }}
    >
      <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 16 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
        <YAxis
          dataKey="label"
          type="category"
          tickLine={false}
          axisLine={false}
          width={110}
          tick={{ fontSize: 12 }}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {hosts.map((host) => (
          <Bar
            key={host}
            dataKey={host}
            fill={`var(--color-${host})`}
            radius={3}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

function Daily({ series }: { readonly series: AiUsage['series'] }): ReactNode {
  const { rows, hosts } = useMemo(() => {
    const byDay = new Map<string, Record<string, number | string>>()
    const seen = new Set<McpHost>()
    for (const point of series) {
      seen.add(point.host)
      const row = byDay.get(point.day) ?? { day: point.day }
      row[point.host] = point.calls
      byDay.set(point.day, row)
    }
    return { rows: [...byDay.values()], hosts: MCP_HOSTS.filter((host) => seen.has(host)) }
  }, [series])

  if (rows.length === 0) return <Nothing>No calls in this window.</Nothing>

  return (
    <ChartContainer config={hostConfig} className="h-56 w-full">
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(value: string) => value.slice(5)}
        />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {hosts.map((host) => (
          <Bar
            key={host}
            dataKey={host}
            stackId="calls"
            fill={`var(--color-${host})`}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

function Tools({ tools }: { readonly tools: AiUsage['tools'] }): ReactNode {
  if (tools.length === 0) return <Nothing>No tool has been called in this window.</Nothing>

  return (
    <Table className="min-w-[26rem]">
      <TableHeader>
        <TableRow>
          <TableHead>Tool</TableHead>
          <TableHead className="text-right">Calls</TableHead>
          <TableHead className="text-right">Errors</TableHead>
          <TableHead className="text-right">Gated</TableHead>
          <TableHead className="text-right">Median</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tools.map((tool) => (
          <TableRow key={tool.name}>
            <TableCell className="max-w-48 truncate" title={tool.name}>
              {toolLabel(tool.name)}
            </TableCell>
            <TableCell className="tabular text-right">{tool.calls}</TableCell>
            <TableCell className="tabular text-right">{tool.errors}</TableCell>
            <TableCell className="tabular text-right">{tool.gated}</TableCell>
            <TableCell className="tabular text-muted-foreground text-right">
              {tool.medianMs === null ? '–' : `${String(tool.medianMs)} ms`}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function GateMissing({ figures }: { readonly figures: AiUsage['gateMissing'] }): ReactNode {
  if (figures.length === 0) {
    return <Nothing>The gate has not held a card back in this window.</Nothing>
  }

  const most = Math.max(...figures.map((entry) => entry.count), 1)

  return (
    <div className="space-y-3">
      {figures.map((entry) => (
        <div key={entry.figure} className="space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 text-sm">{figureLabel(entry.figure)}</span>
            <span className="tabular text-sm font-medium">{entry.count}</span>
          </div>
          <Progress value={(entry.count / most) * 100} className="h-2" />
        </div>
      ))}
    </div>
  )
}

function HostBadge({ host }: { readonly host: McpHost }): ReactNode {
  return (
    <Badge variant="outline" className="text-2xs gap-1.5">
      <span
        aria-hidden
        className="size-2 rounded-[2px]"
        style={{ background: hostConfig[host].color }}
      />
      {HOST_LABELS[host]}
    </Badge>
  )
}

function OutcomeBadge({ outcome }: { readonly outcome: AiUsageCall['outcome'] }): ReactNode {
  switch (outcome) {
    case 'ok':
      return (
        <Badge variant="secondary" className="text-2xs">
          ok
        </Badge>
      )
    case 'gated':
      return (
        <Badge variant="outline" className="text-2xs">
          gated
        </Badge>
      )
    case 'error':
      return (
        <Badge variant="destructive" className="text-2xs">
          error
        </Badge>
      )
  }
}

function Recent({
  calls,
  more,
}: {
  readonly calls: readonly AiUsageCall[]
  readonly more: More
}): ReactNode {
  if (calls.length === 0) return <Nothing>No calls in this window.</Nothing>

  return (
    <div className="space-y-3">
      <Table className="min-w-[44rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Assistant</TableHead>
            <TableHead>Tool</TableHead>
            <TableHead>Asked</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead className="text-right">ms</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {calls.map((call) => {
            const asked = askedText(call.asked)
            return (
              <TableRow key={call.id}>
                <TableCell className="tabular text-muted-foreground whitespace-nowrap">
                  {callTime(call.calledAt)}
                </TableCell>
                <TableCell>
                  <HostBadge host={call.host} />
                </TableCell>
                <TableCell className="max-w-44 truncate" title={call.name}>
                  {toolLabel(call.name)}
                  {call.card && <span className="text-muted-foreground"> · card</span>}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-72 truncate" title={asked}>
                  {asked === '' ? '–' : asked}
                  {call.gateMissing.length > 0 && (
                    <span>
                      {asked === '' ? '' : ' · '}waiting for{' '}
                      {call.gateMissing.map(figureLabel).join(', ').toLowerCase()}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <OutcomeBadge outcome={call.outcome} />
                </TableCell>
                <TableCell className="tabular text-muted-foreground text-right">
                  {call.ms}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {more !== null && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" disabled={more.loading} onClick={more.load}>
            {more.loading ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  )
}

/** Folded away: a list for extending the host map, not for reading every day. */
function UserAgents({ agents }: { readonly agents: AiUsage['userAgents'] }): ReactNode {
  if (agents.length === 0) return null

  return (
    <Card className="min-w-0 py-0">
      <details className="group">
        <summary className="hover:bg-muted/50 cursor-pointer list-none rounded-xl px-6 py-4 text-sm font-medium">
          Unrecognised user agents ({agents.length})
          <span className="text-muted-foreground block text-xs font-normal">
            Calls the host map counted as Other. A name here can be added to the map in saoi-mcp.
          </span>
        </summary>
        <ul className="space-y-1 px-6 pb-4">
          {agents.map((entry) => (
            <li key={entry.userAgent} className="flex items-baseline gap-2 text-sm">
              <code className="min-w-0 flex-1 truncate text-xs" title={entry.userAgent}>
                {entry.userAgent}
              </code>
              <span className="tabular font-medium">{entry.count}</span>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  )
}

/**
 * `scroll`: a table wider than a phone scrolls sideways inside the card (as Collaborators does)
 * rather than clipping its last columns.
 */
function Panel({
  title,
  description,
  scroll = false,
  children,
}: {
  readonly title: string
  readonly description: string
  readonly scroll?: boolean
  readonly children: ReactNode
}): ReactNode {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className={scroll ? 'min-w-0 overflow-x-auto' : undefined}>
        {children}
      </CardContent>
    </Card>
  )
}

function Nothing({ children }: { readonly children: ReactNode }): ReactNode {
  return <p className="text-muted-foreground py-6 text-center text-sm">{children}</p>
}

function Loading(): ReactNode {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-36" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </>
  )
}
