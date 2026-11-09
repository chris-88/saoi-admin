import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { MarketProductVersion } from '@contracts/market.ts'

const current: MarketProductVersion = {
  provider: 'boi',
  category: 'savings',
  productId: 'savings.supersaver',
  providerProductName: 'Supersaver',
  rates: { kind: 'deposit', aerPct: 2.5, basis: 'variable' },
  conditions: { takesMonthly: true, takesLumpSum: false },
  sourceUrl: 'https://example.invalid/supersaver',
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
})
