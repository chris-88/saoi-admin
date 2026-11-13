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
const { headlineRate } = await import('@/admin/marketFormat')

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

    fireEvent.click(screen.getByRole('button', { name: 'Provider site' }))
    expect(screen.queryByText('Online Saver')).not.toBeInTheDocument()
    expect(screen.getByText('Supersaver')).toBeInTheDocument()
  })

  it('renders the table, with the filters inline, at desk width', async () => {
    list.mockResolvedValue({ items: [current, fromCcpc], skipped: 0 })
    renderScreen()
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Provider site' })).toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: 'Provider site' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const sheet = await screen.findByRole('dialog', { name: 'Filters' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Provider site' }))
    expect(within(sheet).getByText('1 of 2 products · 1 source')).toBeInTheDocument()

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

const ladder: MarketProductVersion = {
  ...current,
  provider: 'kbc',
  category: 'deposit',
  productId: 'deposit.ladder',
  providerProductName: 'Term Ladder',
  rates: {
    kind: 'deposit',
    aerPct: null,
    basis: 'fixed',
    terms: [
      { months: 12, aerPct: 2 },
      { months: 24, aerPct: 2.8 },
    ],
  },
}
const noRate: MarketProductVersion = {
  ...current,
  provider: 'avant',
  category: 'credit_card',
  productId: 'card.plain',
  providerProductName: 'Plain Card',
  rates: {
    kind: 'credit_card',
    aprPct: null,
    purchaseRatePct: null,
    cashRatePct: null,
    balanceTransferIntroMonths: null,
    balanceTransferIntroPct: null,
  },
}
const cardRates = {
  kind: 'credit_card',
  aprPct: null,
  purchaseRatePct: null,
  cashRatePct: null,
  balanceTransferIntroMonths: null,
  balanceTransferIntroPct: null,
} as const
const four = [current, fromCcpc, ladder, noRate]
const NAMES = ['Supersaver', 'Online Saver', 'Term Ladder', 'Plain Card'] as const

/** The product names on screen, in the order they appear. */
function namesInOrder(): string[] {
  const text = document.body.textContent
  return NAMES.filter((name) => text.includes(name)).sort(
    (a, b) => text.indexOf(a) - text.indexOf(b),
  )
}

function setBound(
  scope: { getByLabelText: typeof screen.getByLabelText },
  label: string,
  value: string,
) {
  fireEvent.change(scope.getByLabelText(label), { target: { value } })
}

describe('the headline rate', () => {
  it('reads the rate each kind leads with', () => {
    expect(headlineRate({ kind: 'deposit', aerPct: 2.5, basis: 'variable' })).toBe(2.5)
    expect(headlineRate(ladder.rates)).toBe(2.8)
    expect(
      headlineRate({
        kind: 'deposit',
        aerPct: null,
        basis: null,
        tiers: [
          { minEur: 0, maxEur: 10000, aerPct: 1.5 },
          { minEur: 10000, maxEur: null, aerPct: 2.25 },
        ],
      }),
    ).toBe(2.25)
    expect(
      headlineRate({
        kind: 'deposit',
        aerPct: 4,
        basis: 'variable',
        thresholdBonus: {
          bonusAerPct: 4,
          resetMonths: [1, 7],
          lookbackMonths: 6,
          baseTiers: [{ minEur: 0, maxEur: null, aerPct: 1 }],
        },
      }),
    ).toBe(4)
    expect(headlineRate({ kind: 'deposit', aerPct: null, basis: null })).toBeNull()
    expect(
      headlineRate({
        kind: 'mortgage',
        rateType: 'fixed',
        fixedYears: 3,
        initialRatePct: 3.85,
        followOnRatePct: 4.2,
        fullTermRatePct: null,
        ltvMinPct: null,
        ltvMaxPct: 80,
        ber: null,
        cashback: false,
        customerTypes: ['mover'],
      }),
    ).toBe(3.85)
    expect(
      headlineRate({
        kind: 'loan',
        aprPct: 8.9,
        rateType: 'fixed',
        maxAmountEur: null,
        maxTermMonths: null,
        purposes: [],
      }),
    ).toBe(8.9)
    expect(headlineRate({ ...cardRates, aprPct: 22.9, purchaseRatePct: 13.8 })).toBe(22.9)
    expect(headlineRate({ ...cardRates, purchaseRatePct: 13.8 })).toBe(13.8)
    expect(headlineRate(cardRates)).toBeNull()
    expect(
      headlineRate({
        kind: 'current_account',
        quarterlyFeeEur: 6,
        creditInterestPct: 0.5,
        overdraft: true,
      }),
    ).toBe(0.5)
    expect(
      headlineRate({
        kind: 'current_account',
        quarterlyFeeEur: 6,
        creditInterestPct: null,
        overdraft: null,
      }),
    ).toBe(0)
  })
})

describe('the rate and multi-select filters at desk width', () => {
  it('bounds the list by headline rate, keeping a product with no rate only unbounded', async () => {
    list.mockResolvedValue({ items: four, skipped: 0 })
    renderScreen()
    expect(await screen.findByText('Plain Card')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Rate' })).toBeInTheDocument()
    const atLeast = screen.getByLabelText('At least')
    expect(atLeast).toHaveAttribute('inputmode', 'decimal')
    expect(atLeast).toHaveAttribute('step', '0.1')

    setBound(screen, 'At least', '2.6')
    expect(namesInOrder()).toEqual(['Online Saver', 'Term Ladder'])
    setBound(screen, 'At most', '2.9')
    expect(namesInOrder()).toEqual(['Term Ladder'])

    setBound(screen, 'At least', '')
    expect(namesInOrder()).toEqual(['Supersaver', 'Term Ladder'])
    setBound(screen, 'At most', '')
    expect(namesInOrder()).toEqual([...NAMES])

    setBound(screen, 'At most', '5')
    expect(screen.queryByText('Plain Card')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByLabelText('At most')).toHaveValue(null)
    expect(namesInOrder()).toEqual([...NAMES])
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('sorts by headline rate, highest first and no rate last, and turns back off', async () => {
    list.mockResolvedValue({ items: [noRate, current, ladder, fromCcpc], skipped: 0 })
    renderScreen()
    expect(await screen.findByText('Plain Card')).toBeInTheDocument()
    const sort = screen.getByRole('button', { name: 'Highest rate first' })
    expect(sort).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(sort)
    expect(sort).toHaveAttribute('aria-pressed', 'true')
    expect(namesInOrder()).toEqual(['Online Saver', 'Term Ladder', 'Supersaver', 'Plain Card'])
    fireEvent.click(sort)
    expect(namesInOrder()).toEqual(['Plain Card', 'Supersaver', 'Term Ladder', 'Online Saver'])
  })

  it('selects several providers, narrows on deselecting one, and shows all with none', async () => {
    list.mockResolvedValue({ items: four, skipped: 0 })
    renderScreen()
    expect(await screen.findByText('Plain Card')).toBeInTheDocument()
    const boi = screen.getByRole('button', { name: 'boi' })
    const aib = screen.getByRole('button', { name: 'aib' })
    fireEvent.click(boi)
    fireEvent.click(aib)
    expect(boi).toHaveAttribute('aria-pressed', 'true')
    expect(aib).toHaveAttribute('aria-pressed', 'true')
    expect(namesInOrder()).toEqual(['Supersaver', 'Online Saver'])

    fireEvent.click(aib)
    expect(aib).toHaveAttribute('aria-pressed', 'false')
    expect(namesInOrder()).toEqual(['Supersaver'])

    fireEvent.click(boi)
    expect(namesInOrder()).toEqual([...NAMES])
  })

  it('selects several categories the same way', async () => {
    list.mockResolvedValue({ items: four, skipped: 0 })
    renderScreen()
    expect(await screen.findByText('Plain Card')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'deposit' }))
    fireEvent.click(screen.getByRole('button', { name: 'credit_card' }))
    expect(namesInOrder()).toEqual(['Term Ladder', 'Plain Card'])
  })
})

describe('the rate and multi-select filters on a phone', () => {
  it('bounds and sorts from the sheet, counts them in the badge, and clears', async () => {
    atPhoneWidth()
    list.mockResolvedValue({ items: four, skipped: 0 })
    renderScreen()
    expect(await screen.findByText('4 products')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const sheet = within(await screen.findByRole('dialog', { name: 'Filters' }))
    expect(sheet.getByLabelText('At least')).toHaveClass('h-11')
    setBound(sheet, 'At least', '2.6')
    expect(sheet.getByText('2 of 4 products')).toBeInTheDocument()
    fireEvent.click(sheet.getByRole('button', { name: 'Highest rate first' }))

    fireEvent.click(sheet.getByRole('button', { name: 'Show results' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Filters, 2 active' })).toBeInTheDocument()
    expect(screen.getByText('2 of 4 products')).toBeInTheDocument()
    const headings = within(screen.getByRole('list', { name: 'Products' })).getAllByRole('heading')
    expect(headings.map((h) => h.textContent)).toEqual(['aibOnline Saver', 'kbcTerm Ladder'])

    fireEvent.click(screen.getByRole('button', { name: 'Filters, 2 active' }))
    const again = within(await screen.findByRole('dialog'))
    setBound(again, 'At least', '')
    // Unbounded, the card with no rate is back.
    expect(again.getByText('4 products')).toBeInTheDocument()
    fireEvent.click(again.getByRole('button', { name: 'Clear' }))
    expect(again.getByRole('button', { name: 'Highest rate first' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    fireEvent.click(again.getByRole('button', { name: 'Show results' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument()
  })

  it('selects several providers in the sheet and names them in the count line', async () => {
    atPhoneWidth()
    list.mockResolvedValue({ items: four, skipped: 0 })
    renderScreen()
    expect(await screen.findByText('4 products')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const sheet = within(await screen.findByRole('dialog', { name: 'Filters' }))
    fireEvent.click(sheet.getByRole('button', { name: 'boi' }))
    fireEvent.click(sheet.getByRole('button', { name: 'kbc' }))
    fireEvent.click(sheet.getByRole('button', { name: 'avant' }))
    expect(sheet.getByText('3 of 4 products · 3 providers')).toBeInTheDocument()
    fireEvent.click(sheet.getByRole('button', { name: 'avant' }))
    expect(sheet.getByText('2 of 4 products · 2 providers')).toBeInTheDocument()

    fireEvent.click(sheet.getByRole('button', { name: 'Show results' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filters, 1 active' }))
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Clear' }),
    )
    expect(screen.getByText('Plain Card')).toBeInTheDocument()
    expect(screen.getByText('Online Saver')).toBeInTheDocument()
  })
})
