import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AiUsage, AiUsageCall } from '@contracts/admin.ts'

const COUNTS = {
  calls: 0,
  sessions: 0,
  cardsShown: 0,
  plansSaved: 0,
  linksOpened: 0,
  claimed: 0,
  signedIn: 0,
  chosen: 0,
}

const STEPS = [
  ['calls', 'Calls'],
  ['cardsShown', 'Cards shown'],
  ['plansSaved', 'Plans saved'],
  ['linksOpened', 'Links opened'],
  ['claimed', 'Claimed'],
  ['signedIn', 'Signed in'],
  ['chosen', 'Product chosen'],
] as const

const call = (over: Partial<AiUsageCall>): AiUsageCall => ({
  id: '00000000-0000-4000-8000-000000000001',
  calledAt: '2026-11-14T10:05:00.000Z',
  host: 'claude',
  name: 'saoi_home_calculator',
  kind: 'tool',
  outcome: 'ok',
  ms: 120,
  card: true,
  asked: {},
  gateMissing: [],
  ...over,
})

const EMPTY: AiUsage = {
  period: '7d',
  from: '2026-11-07T10:00:00.000Z',
  to: '2026-11-14T10:00:00.000Z',
  totals: COUNTS,
  previous: COUNTS,
  funnel: [],
  series: [],
  tools: [],
  gateMissing: [],
  userAgents: [],
  recent: [],
  nextCursor: null,
}

const BUSY: AiUsage = {
  ...EMPTY,
  totals: { ...COUNTS, calls: 3, sessions: 2, cardsShown: 1, plansSaved: 1, linksOpened: 1 },
  funnel: [
    {
      host: 'claude',
      steps: STEPS.map(([step, label], i) => ({
        step,
        label,
        count: [2, 1, 1, 1, 0, 0, 0][i] ?? 0,
      })),
    },
    {
      host: 'chatgpt',
      steps: STEPS.map(([step, label], i) => ({ step, label, count: i === 0 ? 1 : 0 })),
    },
  ],
  series: [
    { day: '2026-11-13', host: 'claude', calls: 1 },
    { day: '2026-11-13', host: 'chatgpt', calls: 0 },
    { day: '2026-11-14', host: 'claude', calls: 1 },
    { day: '2026-11-14', host: 'chatgpt', calls: 1 },
  ],
  tools: [
    { name: 'saoi_home_calculator', calls: 2, errors: 0, gated: 1, medianMs: 80 },
    { name: 'saoi_product', calls: 1, errors: 1, gated: 0, medianMs: null },
  ],
  gateMissing: [{ figure: 'annualGrossIncomeEur', count: 1 }],
  userAgents: [{ userAgent: 'node', count: 1 }],
  recent: [
    call({
      host: 'chatgpt',
      outcome: 'gated',
      card: false,
      asked: { price: '350-450k', buyingTogether: true },
      gateMissing: ['annualGrossIncomeEur'],
    }),
    call({
      id: '00000000-0000-4000-8000-000000000002',
      name: 'saoi_product',
      outcome: 'error',
      asked: { id: 'boi:x' },
    }),
  ],
  nextCursor: 'page-2',
}

const aiUsage = vi.fn<(period: string, cursor?: string) => Promise<AiUsage>>()
vi.mock('@/admin/adminClient', () => ({
  adminApi: { aiUsage: (p: string, c?: string) => aiUsage(p, c) },
}))

const { AiUsageScreen } = await import('@/admin/AiUsageScreen')

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AiUsageScreen period="7d" />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  aiUsage.mockReset()
})

describe('AiUsageScreen', () => {
  it('says what will appear when no AI has called', async () => {
    aiUsage.mockResolvedValue(EMPTY)
    renderScreen()
    expect(await screen.findByText('No AI has called Saoi in this window')).toBeInTheDocument()
    expect(
      screen.getByText(/its calls, the funnel from a call to a product chosen/),
    ).toBeInTheDocument()
    expect(aiUsage).toHaveBeenCalledWith('7d', undefined)
  })

  it('shows the error when the read fails', async () => {
    aiUsage.mockRejectedValue(new Error('Not an administrator.'))
    renderScreen()
    expect(await screen.findByText('Not an administrator.')).toBeInTheDocument()
  })

  it('shows the headline, tools, the gate, the recent calls and the unknown user agents', async () => {
    aiUsage.mockResolvedValue(BUSY)
    renderScreen()
    expect(await screen.findByText('The link funnel, by assistant')).toBeInTheDocument()
    expect(screen.getByText('Calls a day')).toBeInTheDocument()

    const [tools] = screen.getAllByRole('table')
    if (tools === undefined) throw new Error('no tools table')
    expect(within(tools).getByText('home calculator')).toBeInTheDocument()
    expect(within(tools).getByText('80 ms')).toBeInTheDocument()

    expect(screen.getAllByText('Income').length).toBeGreaterThan(0)
    expect(screen.getByTitle('price 350-450k · buying together')).toHaveTextContent(
      'price 350-450k · buying together · waiting for income',
    )
    expect(screen.getByText('gated')).toBeInTheDocument()
    expect(screen.getByText('error')).toBeInTheDocument()
    expect(screen.getByText('Unrecognised user agents (1)')).toBeInTheDocument()
  })

  it('loads the next fifty on the cursor and appends them', async () => {
    aiUsage.mockImplementation((_period, cursor) =>
      Promise.resolve(
        cursor === undefined
          ? BUSY
          : {
              ...BUSY,
              recent: [call({ id: '00000000-0000-4000-8000-000000000003', name: 'saoi_debt' })],
              nextCursor: null,
            },
      ),
    )
    renderScreen()
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('debt')).toBeInTheDocument()
    expect(aiUsage).toHaveBeenLastCalledWith('7d', 'page-2')
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    })
  })
})
