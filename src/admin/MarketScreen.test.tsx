import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { MarketProductVersion } from '@contracts/market.ts'

const current: MarketProductVersion = {
  provider: 'boi',
  source: 'bank',
  category: 'savings',
  productId: 'savings.supersaver',
  providerProductName: 'Supersaver',
  rates: { kind: 'deposit', aerPct: 2.5, basis: 'variable' },
  conditions: { takesMonthly: true, takesLumpSum: false },
  sourceUrl: 'https://example.invalid/supersaver',
  providerUrl: null,
  sourceProductId: null,
  sourceUpdatedAt: null,
  attribution: null,
  unknown: [],
  effectiveFrom: null,
  firstSeenAt: '2026-10-01T00:00:00.000Z',
  checkedAt: '2020-01-01T00:00:00.000Z',
  supersededAt: null,
}
const old: MarketProductVersion = {
  ...current,
  rates: { kind: 'deposit', aerPct: 2.2, basis: 'variable' },
  firstSeenAt: '2026-09-01T00:00:00.000Z',
  supersededAt: '2026-10-01T00:00:00.000Z',
}

const fromCcpc: MarketProductVersion = {
  ...current,
  provider: 'aib',
  source: 'ccpc',
  productId: 'savings.c396',
  providerProductName: 'Online Saver',
  rates: { kind: 'deposit', aerPct: 3, basis: null },
  conditions: { takesMonthly: true },
  sourceUrl: 'https://www.ccpc.ie/regular-savings-comparison-tool',
  providerUrl: 'https://personal.aib.ie/online-saver',
  sourceProductId: '396',
  attribution: 'Source: Competition and Consumer Protection Commission, www.ccpc.ie',
  unknown: ['conditions.minAge'],
  checkedAt: new Date().toISOString(),
}

const list = vi.fn<() => Promise<unknown>>()
vi.mock('@/admin/adminClient', () => ({ adminApi: { listMarketProducts: () => list() } }))

const { MarketScreen } = await import('@/admin/MarketScreen')

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MarketScreen />
    </QueryClientProvider>,
  )
}

/** A viewport under `md`: every `max-width` query matches, which is what a phone answers. */
function atPhoneWidth() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the market data screen', () => {
  it('shows current rates, a stale check, the source link and the history', async () => {
    list.mockResolvedValue({ items: [current, old], skipped: 0 })
    renderScreen()
    expect(await screen.findByText('Supersaver')).toBeInTheDocument()
    expect(screen.getByText('2.5% AER')).toBeInTheDocument()
    expect(screen.getByText(/\(stale\)/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open page/i })).toHaveAttribute(
      'href',
      'https://example.invalid/supersaver',
    )
    fireEvent.click(screen.getByRole('button', { name: /details and history \(2\)/i }))
    expect(screen.getByText('rates.aerPct: 2.2 → 2.5')).toBeInTheDocument()
  })

  it('says so when there is no data, and when the call fails', async () => {
    list.mockResolvedValueOnce({ items: [], skipped: 0 })
    renderScreen()
    expect(await screen.findByText('No market data yet')).toBeInTheDocument()
  })

  it('shows the error', async () => {
    list.mockRejectedValueOnce(new Error('boom'))
    renderScreen()
    expect(await screen.findByText('boom')).toBeInTheDocument()
  })

  it('shows a CCPC row with its attribution, and filters by source', async () => {
    list.mockResolvedValue({ items: [current, fromCcpc], skipped: 0 })
    renderScreen()
    expect(await screen.findByText('Online Saver')).toBeInTheDocument()
    expect(
      screen.getAllByText('Source: Competition and Consumer Protection Commission, www.ccpc.ie')
        .length,
    ).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /provider page/i })).toHaveAttribute(
      'href',
      'https://personal.aib.ie/online-saver',
    )
    expect(screen.getByText('conditions.minAge')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Provider site' }))
    expect(screen.queryByText('Online Saver')).not.toBeInTheDocument()
    expect(screen.getByText('Supersaver')).toBeInTheDocument()
  })

  it('renders the table, with the filters inline, at desk width', async () => {
    list.mockResolvedValue({ items: [current, fromCcpc], skipped: 0 })
    renderScreen()
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Provider site' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^filters/i })).not.toBeInTheDocument()
  })
})

describe('the market data screen on a phone', () => {
  it('shows each product as a card with folded conditions and an opening detail', async () => {
    atPhoneWidth()
    list.mockResolvedValue({ items: [current, old, fromCcpc], skipped: 0 })
    renderScreen()

    const cards = await screen.findByRole('list', { name: 'Products' })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('2 products')).toBeInTheDocument()

    const card = within(cards).getAllByRole('listitem')[0]
    if (card === undefined) throw new Error('no card')
    const inCard = within(card)
    expect(inCard.getByRole('heading', { name: /boi\s*Supersaver/ })).toBeInTheDocument()
    expect(inCard.getByText('2.5% AER')).toBeInTheDocument()
    expect(inCard.getByText(/stale/)).toBeInTheDocument()
    expect(inCard.getByText(/Changed 2026-10-01/)).toBeInTheDocument()

    const conditions = inCard.getByRole('button', { name: 'Conditions' })
    expect(conditions).toHaveAttribute('aria-expanded', 'false')
    expect(inCard.queryByText('Monthly saving')).not.toBeInTheDocument()
    fireEvent.click(conditions)
    expect(conditions).toHaveAttribute('aria-expanded', 'true')
    expect(inCard.getByText('Monthly saving')).toBeInTheDocument()

    const details = inCard.getByRole('button', { name: /details and history \(2\)/i })
    expect(inCard.queryByRole('link', { name: /open page/i })).not.toBeInTheDocument()
    fireEvent.click(details)
    expect(details).toHaveAttribute('aria-expanded', 'true')
    expect(inCard.getByText('rates.aerPct: 2.2 → 2.5')).toBeInTheDocument()
    expect(inCard.getByRole('link', { name: /open page/i })).toHaveAttribute(
      'href',
      'https://example.invalid/supersaver',
    )
  })

  it('keeps the not-stated line inside the folded conditions', async () => {
    atPhoneWidth()
    list.mockResolvedValue({ items: [fromCcpc], skipped: 0 })
    renderScreen()
    expect(await screen.findByText('Online Saver')).toBeInTheDocument()
    expect(screen.queryByText('conditions.minAge')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Conditions' }))
    expect(screen.getByText('conditions.minAge')).toBeInTheDocument()
  })

  it('filters from a sheet, and counts the active filters and the results', async () => {
    atPhoneWidth()
    list.mockResolvedValue({ items: [current, fromCcpc], skipped: 0 })
    renderScreen()
    expect(await screen.findByText('2 products')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Provider site' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const sheet = await screen.findByRole('dialog', { name: 'Filters' })
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Provider site' }))
    expect(within(sheet).getByText('1 of 2 products')).toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole('button', { name: 'Show results' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toBeInTheDocument()
    expect(screen.getByText('1 of 2 products')).toBeInTheDocument()
    expect(screen.queryByText('Online Saver')).not.toBeInTheDocument()
    expect(screen.getByText('Supersaver')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filters, 1 active' }))
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Clear' }),
    )
    expect(screen.getByText('Online Saver')).toBeInTheDocument()
  })
})
