import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { MarketProductVersion } from '@contracts/market.ts'
import type { MarketView } from '@/admin/marketViews'

const view = (overrides: Partial<MarketView>): MarketView => ({
  id: 'x',
  provider: 'x',
  providerName: 'X',
  category: 'savings',
  categoryLabel: 'Savings',
  name: 'X',
  headline: { ratePct: null, label: 'rate not stated' },
  termMonths: null,
  termLabel: null,
  ladder: [],
  access: null,
  lines: [],
  conditions: [],
  unknown: [],
  checkedAt: '2026-11-10T00:00:00.000Z',
  lastChangedAt: null,
  stale: false,
  retired: false,
  sources: [],
  ...overrides,
})

const boiDeposit = view({
  id: 'boi:deposits.fixed_term',
  provider: 'boi',
  providerName: 'Bank of Ireland',
  category: 'deposits',
  categoryLabel: 'Deposits',
  name: 'Fixed Term Deposit',
  headline: { ratePct: 2, label: '2.00% AER' },
  termMonths: 6,
  termLabel: '6 to 18 months',
  access: 'Fixed term',
  ladder: [
    { months: 6, ratePct: 2 },
    { months: 12, ratePct: 2.3 },
    { months: 18, ratePct: 2.48 },
  ],
  lines: ['2.48% AER for 18 months, fixed'],
  conditions: [{ label: 'Lump sum', value: '€5,000 to €1,000,000' }],
  checkedAt: '2026-11-12T00:00:00.000Z',
  lastChangedAt: '2026-10-01T00:00:00.000Z',
  sources: [
    {
      source: 'bank',
      rowId: 'boi:deposit.fixed_term',
      url: 'https://example.invalid/boi',
      checkedAt: '2026-11-12T00:00:00.000Z',
    },
    {
      source: 'ccpc',
      rowId: 'boi:deposit.c18',
      url: 'https://www.ccpc.ie/deposits',
      checkedAt: '2026-11-11T00:00:00.000Z',
    },
  ],
})
const aibSaver = view({
  id: 'aib:savings.c396',
  provider: 'aib',
  providerName: 'AIB',
  name: 'Online Saver',
  headline: { ratePct: 3, label: '3.00% AER' },
  access: 'Instant access',
  lines: ['3% AER, variable'],
  unknown: ['the minimum age to open it'],
  checkedAt: '2026-10-01T00:00:00.000Z',
  stale: true,
  sources: [
    { source: 'ccpc', rowId: 'aib:savings.c396', url: null, checkedAt: '2026-10-01T00:00:00.000Z' },
  ],
})
const kbcMortgage = view({
  id: 'kbc:mortgages.fixed4',
  provider: 'kbc',
  providerName: 'KBC',
  category: 'mortgages',
  categoryLabel: 'Mortgages',
  name: 'Four Year Fixed',
  headline: { ratePct: 3.2, label: '3.20% initial' },
  termMonths: 48,
  termLabel: '4-year fixed',
  checkedAt: '2026-11-09T00:00:00.000Z',
  lastChangedAt: '2026-11-05T00:00:00.000Z',
  sources: [
    { source: 'ccpc', rowId: 'kbc:mortgage.c1', url: null, checkedAt: '2026-11-09T00:00:00.000Z' },
  ],
})
const avantCard = view({
  id: 'avant:credit_cards.plain',
  provider: 'avant',
  providerName: 'Avant Money',
  category: 'credit_cards',
  categoryLabel: 'Credit cards',
  name: 'Plain Card',
  headline: { ratePct: null, label: '' },
  checkedAt: '2026-11-13T00:00:00.000Z',
  sources: [
    { source: 'ccpc', rowId: 'avant:card.c2', url: null, checkedAt: '2026-11-13T00:00:00.000Z' },
  ],
})
const boiLoan = view({
  id: 'boi:loans.personal',
  provider: 'boi',
  providerName: 'Bank of Ireland',
  category: 'loans',
  categoryLabel: 'Loans',
  name: 'Personal Loan',
  headline: { ratePct: 8.9, label: 'APR 8.90%' },
  termMonths: 60,
  termLabel: 'up to 5 years',
  checkedAt: '2026-11-08T00:00:00.000Z',
  lastChangedAt: '2026-11-07T00:00:00.000Z',
  sources: [
    { source: 'ccpc', rowId: 'boi:loan.c3', url: null, checkedAt: '2026-11-08T00:00:00.000Z' },
  ],
})
const ALL = [aibSaver, kbcMortgage, avantCard, boiDeposit, boiLoan]

const row: MarketProductVersion = {
  provider: 'boi',
  source: 'bank',
  category: 'deposit',
  productId: 'deposit.fixed_term',
  providerProductName: 'Fixed Term Deposit Account',
  rates: { kind: 'deposit', aerPct: 2.48, basis: 'fixed' },
  conditions: {},
  sourceUrl: 'https://example.invalid/boi',
  providerUrl: null,
  sourceProductId: null,
  sourceUpdatedAt: null,
  attribution: null,
  unknown: [],
  effectiveFrom: null,
  firstSeenAt: '2026-10-01T00:00:00.000Z',
  checkedAt: '2026-11-12T00:00:00.000Z',
  supersededAt: null,
}
const rowBefore: MarketProductVersion = {
  ...row,
  rates: { kind: 'deposit', aerPct: 2.2, basis: 'fixed' },
  firstSeenAt: '2026-09-01T00:00:00.000Z',
  supersededAt: '2026-10-01T00:00:00.000Z',
}
const ccpcRow: MarketProductVersion = {
  ...row,
  source: 'ccpc',
  productId: 'deposit.c18',
  providerProductName: 'Fixed Term Deposit 18 Months',
  sourceUrl: 'https://www.ccpc.ie/deposits',
  sourceProductId: '18',
  attribution: 'Source: Competition and Consumer Protection Commission, www.ccpc.ie',
}

const views = vi.fn<() => Promise<unknown>>()
const products = vi.fn<() => Promise<unknown>>()
vi.mock('@/admin/adminClient', () => ({
  adminApi: { listMarketViews: () => views(), listMarketProducts: () => products() },
}))

const { MarketScreen } = await import('@/admin/MarketScreen')

function renderScreen(list: readonly MarketView[] = ALL) {
  views.mockResolvedValue({ asOf: '2026-11-13T06:00:00.000Z', views: list })
  products.mockResolvedValue({ items: [row, rowBefore, ccpcRow], skipped: 0 })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MarketScreen />
    </QueryClientProvider>,
  )
}

/** A viewport `width` wide: a `max-width` query matches when the width is within it. */
function atWidth(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query)?.[1]
    return {
      matches: max !== undefined && width <= Number(max),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
  views.mockReset()
  products.mockReset()
})

const productList = () => screen.getByRole('list', { name: 'Products' })

/** The cards, as "Provider Product", in the order shown. */
function cardsInOrder(): string[] {
  return within(productList())
    .getAllByRole('heading', { level: 2 })
    .map((heading) => [...heading.children].map((part) => part.textContent).join(' '))
}

function cardOf(name: string): HTMLElement {
  const item = within(productList())
    .getAllByRole('listitem')
    .find((li) => within(li).queryByRole('heading', { level: 2, name: new RegExp(name) }))
  if (item === undefined) throw new Error(`no card for ${name}`)
  return item
}

/** A multi-select is a toolbar of toggle buttons; the sort, a radio group. */
const chip = (group: string, name: string) =>
  group === 'Sort'
    ? within(screen.getByRole('radiogroup', { name: 'Sort' })).getByRole('radio', { name })
    : within(screen.getByRole('toolbar', { name: group })).getByRole('button', { name })

describe('the market views at desk width', () => {
  it('shows one card per product with readable names, labels, the ladder and the dates', async () => {
    atWidth(1440)
    renderScreen()
    await screen.findByRole('list', { name: 'Products' })
    expect(cardsInOrder()).toEqual([
      'AIB Online Saver',
      'Avant Money Plain Card',
      'Bank of Ireland Fixed Term Deposit',
      'Bank of Ireland Personal Loan',
      'KBC Four Year Fixed',
    ])

    const boi = within(cardOf('Fixed Term Deposit'))
    expect(boi.getByText('2.00% AER')).toBeInTheDocument()
    expect(boi.getByText('Deposits · 6 to 18 months · Fixed term')).toBeInTheDocument()
    expect(boi.getByText('2.48% AER for 18 months, fixed')).toBeInTheDocument()
    const terms = within(boi.getByRole('list', { name: 'Terms' })).getAllByRole('listitem')
    expect(terms.map((t) => t.textContent)).toEqual(['6m 2%', '12m 2.3%', '18m 2.48%'])
    expect(boi.getByText(/Checked 12 Nov 2026/)).not.toHaveClass('text-destructive')
    expect(boi.getByText(/Changed 1 Oct 2026/)).toBeInTheDocument()
    expect(boi.getByRole('button', { name: 'Provider site' })).toBeInTheDocument()
    expect(boi.getByRole('button', { name: 'CCPC' })).toBeInTheDocument()

    const aib = within(cardOf('Online Saver'))
    expect(aib.getByText('Savings · Instant access')).toBeInTheDocument()
    expect(aib.getByText('Checked 1 Oct 2026 (stale)')).toHaveClass('text-destructive')
    expect(aib.getByText(/No change recorded/)).toBeInTheDocument()
    expect(within(cardOf('Four Year Fixed')).getByText('Mortgages · 4-year fixed')).toBeVisible()
    const card = within(cardOf('Plain Card'))
    expect(card.getByText('Credit cards')).toBeInTheDocument()
    // No headline figure: nothing in its place.
    expect(card.queryByText(/rate not stated|APR/)).not.toBeInTheDocument()

    expect(screen.getByText(/Competition and Consumer Protection Commission/)).toBeInTheDocument()
  })

  it('folds the conditions, with what is not stated, behind a button', async () => {
    atWidth(1440)
    renderScreen()
    const aib = within(await waitFor(() => cardOf('Online Saver')))
    const conditions = aib.getByRole('button', { name: 'Conditions (1)' })
    expect(aib.queryByText('the minimum age to open it')).not.toBeInTheDocument()
    fireEvent.click(conditions)
    expect(conditions).toHaveAttribute('aria-expanded', 'true')
    expect(aib.getByText('the minimum age to open it')).toBeInTheDocument()
  })

  it('opens the raw row and its history from each source badge', async () => {
    atWidth(1440)
    renderScreen()
    const boi = within(await waitFor(() => cardOf('Fixed Term Deposit')))
    const bank = boi.getByRole('button', { name: 'Provider site' })
    const ccpc = boi.getByRole('button', { name: 'CCPC' })
    expect(products).not.toHaveBeenCalled()

    fireEvent.click(bank)
    expect(bank).toHaveAttribute('aria-expanded', 'true')
    const bankRegion = within(boi.getByRole('region', { name: 'Provider site row' }))
    expect(await bankRegion.findByText('rates.aerPct: 2.2 → 2.48')).toBeInTheDocument()
    expect(bankRegion.getByText('Fixed Term Deposit Account')).toBeInTheDocument()
    expect(bankRegion.getByRole('link', { name: /open page/i })).toHaveAttribute(
      'href',
      'https://example.invalid/boi',
    )
    expect(cardOf('Fixed Term Deposit')).toHaveClass('col-span-full')

    fireEvent.click(ccpc)
    expect(bank).toHaveAttribute('aria-expanded', 'false')
    const ccpcRegion = within(boi.getByRole('region', { name: 'CCPC row' }))
    expect(ccpcRegion.getByText('Fixed Term Deposit 18 Months')).toBeInTheDocument()
    expect(ccpcRegion.getByRole('link', { name: /open page/i })).toHaveAttribute(
      'href',
      'https://www.ccpc.ie/deposits',
    )

    fireEvent.click(ccpc)
    expect(boi.queryByRole('region')).not.toBeInTheDocument()
    expect(cardOf('Fixed Term Deposit')).not.toHaveClass('col-span-full')
    expect(products).toHaveBeenCalledTimes(1)
  })

  it('says so when a source row is not in the stored data', async () => {
    atWidth(1440)
    renderScreen()
    const kbc = within(await waitFor(() => cardOf('Four Year Fixed')))
    fireEvent.click(kbc.getByRole('button', { name: 'CCPC' }))
    expect(await kbc.findByText(/is not in the market data/)).toBeInTheDocument()
  })

  it('selects several providers by name, and several categories by label', async () => {
    atWidth(1440)
    renderScreen()
    await screen.findByRole('list', { name: 'Products' })
    fireEvent.click(chip('Provider', 'Bank of Ireland'))
    fireEvent.click(chip('Provider', 'KBC'))
    expect(chip('Provider', 'KBC')).toHaveAttribute('aria-pressed', 'true')
    expect(cardsInOrder()).toEqual([
      'Bank of Ireland Fixed Term Deposit',
      'Bank of Ireland Personal Loan',
      'KBC Four Year Fixed',
    ])
    fireEvent.click(chip('Provider', 'Bank of Ireland'))
    expect(cardsInOrder()).toEqual(['KBC Four Year Fixed'])
    fireEvent.click(chip('Provider', 'KBC'))
    expect(cardsInOrder()).toHaveLength(5)

    fireEvent.click(chip('Category', 'Credit cards'))
    fireEvent.click(chip('Category', 'Deposits'))
    expect(cardsInOrder()).toEqual(['Avant Money Plain Card', 'Bank of Ireland Fixed Term Deposit'])
    expect(screen.getByText('2 of 5 products · 2 categories')).toBeInTheDocument()
  })

  it('filters deposits, loans and mortgages by term buckets, and lets the rest pass', async () => {
    atWidth(1440)
    renderScreen()
    await screen.findByRole('list', { name: 'Products' })
    expect(
      within(screen.getByRole('toolbar', { name: 'Term' }))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'Up to 6 months',
      '7 to 12 months',
      '13 to 24 months',
      '2 to 3 years',
      '4 to 5 years',
      'Over 5 years',
      'Variable or none',
    ])

    fireEvent.click(chip('Term', '4 to 5 years'))
    expect(cardsInOrder()).toEqual([
      'AIB Online Saver',
      'Avant Money Plain Card',
      'Bank of Ireland Personal Loan',
      'KBC Four Year Fixed',
    ])
    // A ladder is in every bucket one of its terms is in.
    fireEvent.click(chip('Term', '13 to 24 months'))
    expect(cardsInOrder()).toContain('Bank of Ireland Fixed Term Deposit')
    fireEvent.click(chip('Term', '4 to 5 years'))
    expect(cardsInOrder()).toEqual([
      'AIB Online Saver',
      'Avant Money Plain Card',
      'Bank of Ireland Fixed Term Deposit',
    ])
  })

  it('bounds by headline rate, keeping a product with no rate only unbounded', async () => {
    atWidth(1440)
    renderScreen()
    await screen.findByRole('list', { name: 'Products' })
    fireEvent.change(screen.getByLabelText('At least'), { target: { value: '3' } })
    expect(cardsInOrder()).toEqual([
      'AIB Online Saver',
      'Bank of Ireland Personal Loan',
      'KBC Four Year Fixed',
    ])
    fireEvent.change(screen.getByLabelText('At most'), { target: { value: '5' } })
    expect(cardsInOrder()).toEqual(['AIB Online Saver', 'KBC Four Year Fixed'])
    fireEvent.change(screen.getByLabelText('At most'), { target: { value: '150' } })
    expect(screen.getByText('A percentage from 0 to 100')).toBeInTheDocument()
  })

  it('sorts by rate, name, recently changed and recently checked', async () => {
    atWidth(1440)
    renderScreen()
    await screen.findByRole('list', { name: 'Products' })
    expect(chip('Sort', 'Name')).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(chip('Sort', 'Rate, high to low'))
    expect(cardsInOrder()).toEqual([
      'Bank of Ireland Personal Loan',
      'KBC Four Year Fixed',
      'AIB Online Saver',
      'Bank of Ireland Fixed Term Deposit',
      'Avant Money Plain Card',
    ])
    fireEvent.click(chip('Sort', 'Recently changed'))
    expect(cardsInOrder()).toEqual([
      'Bank of Ireland Personal Loan',
      'KBC Four Year Fixed',
      'Bank of Ireland Fixed Term Deposit',
      'AIB Online Saver',
      'Avant Money Plain Card',
    ])
    fireEvent.click(chip('Sort', 'Recently checked'))
    expect(cardsInOrder()).toEqual([
      'Avant Money Plain Card',
      'Bank of Ireland Fixed Term Deposit',
      'KBC Four Year Fixed',
      'Bank of Ireland Personal Loan',
      'AIB Online Saver',
    ])
    // Choosing the chosen order again keeps it.
    fireEvent.click(chip('Sort', 'Recently checked'))
    expect(chip('Sort', 'Recently checked')).toHaveAttribute('aria-checked', 'true')
  })

  it('counts the active filters, clears them all, and filters by source', async () => {
    atWidth(1440)
    renderScreen()
    await screen.findByRole('list', { name: 'Products' })
    const clear = screen.getByRole('button', { name: 'Clear filters' })
    expect(clear).toBeDisabled()
    const rail = within(screen.getByRole('complementary', { name: 'Filters' }))

    fireEvent.click(chip('Source', 'Provider site'))
    expect(cardsInOrder()).toEqual(['Bank of Ireland Fixed Term Deposit'])
    fireEvent.click(chip('Sort', 'Rate, high to low'))
    fireEvent.change(screen.getByLabelText('At least'), { target: { value: '1' } })
    expect(rail.getByRole('heading', { name: /Filters/ })).toHaveTextContent('Filters3')
    expect(clear).toBeEnabled()

    fireEvent.click(clear)
    expect(cardsInOrder()).toHaveLength(5)
    expect(screen.getByLabelText('At least')).toHaveValue(null)
    expect(chip('Sort', 'Name')).toHaveAttribute('aria-checked', 'true')
    expect(rail.getByRole('heading', { name: /Filters/ })).toHaveTextContent(/^Filters$/)
    expect(clear).toBeDisabled()
  })

  it('shows the empty state', async () => {
    atWidth(1440)
    renderScreen([])
    expect(await screen.findByText('No market data yet')).toBeInTheDocument()
  })

  it('shows the error', async () => {
    atWidth(1440)
    views.mockRejectedValue(new Error('boom'))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MarketScreen />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('boom')).toBeInTheDocument()
  })
})

describe('the three layouts', () => {
  it('puts the filters in a rail beside three columns on the desk', async () => {
    atWidth(1440)
    renderScreen()
    const list = await screen.findByRole('list', { name: 'Products' })
    expect(list).toHaveAttribute('data-columns', '3')
    expect(screen.getByRole('complementary', { name: 'Filters' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Filters/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('puts the filters in a panel above two columns on a tablet, open and collapsible', async () => {
    atWidth(820)
    renderScreen()
    const list = await screen.findByRole('list', { name: 'Products' })
    expect(list).toHaveAttribute('data-columns', '2')
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    const panel = within(screen.getByRole('region', { name: 'Filters' }))
    const toggle = panel.getByRole('button', { name: 'Filters' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(panel.getByRole('button', { name: 'KBC' }))
    expect(cardsInOrder()).toEqual(['KBC Four Year Fixed'])
    expect(panel.getByText('1 of 5 products · 1 provider')).toBeInTheDocument()

    const active = panel.getByRole('button', { name: 'Filters, 1 active' })
    fireEvent.click(active)
    expect(active).toHaveAttribute('aria-expanded', 'false')
    expect(panel.queryByRole('button', { name: 'KBC' })).not.toBeInTheDocument()
    // The filter holds while the panel is folded, and Clear is still to hand.
    expect(cardsInOrder()).toEqual(['KBC Four Year Fixed'])
    fireEvent.click(panel.getByRole('button', { name: 'Clear filters' }))
    expect(cardsInOrder()).toHaveLength(5)
  })

  it('opens the tablet panel the way the viewer last left it', async () => {
    window.localStorage.setItem('saoi.admin.market.filtersOpen', 'false')
    atWidth(820)
    renderScreen()
    await screen.findByRole('list', { name: 'Products' })
    const toggle = screen.getByRole('button', { name: 'Filters' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(window.localStorage.getItem('saoi.admin.market.filtersOpen')).toBe('true')
    expect(screen.getByRole('toolbar', { name: 'Provider' })).toBeInTheDocument()
  })

  it('is an iPad in landscape at 1180: the desk', async () => {
    atWidth(1180)
    renderScreen()
    expect(await screen.findByRole('list', { name: 'Products' })).toHaveAttribute(
      'data-columns',
      '3',
    )
  })

  it('puts the filters in a sheet over one column on a phone, with the count and badge', async () => {
    atWidth(390)
    renderScreen()
    const list = await screen.findByRole('list', { name: 'Products' })
    expect(list).toHaveAttribute('data-columns', '1')
    expect(screen.getByText('5 products')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'KBC' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const sheet = within(await screen.findByRole('dialog', { name: 'Filters' }))
    fireEvent.click(sheet.getByRole('button', { name: 'Bank of Ireland' }))
    fireEvent.click(sheet.getByRole('button', { name: '4 to 5 years' }))
    expect(sheet.getByText('1 of 5 products · 1 provider · 1 term')).toBeInTheDocument()
    fireEvent.click(sheet.getByRole('radio', { name: 'Rate, high to low' }))

    fireEvent.click(sheet.getByRole('button', { name: 'Show results' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Filters, 3 active' })).toBeInTheDocument()
    expect(screen.getByText('1 of 5 products')).toBeInTheDocument()
    expect(cardsInOrder()).toEqual(['Bank of Ireland Personal Loan'])

    fireEvent.click(screen.getByRole('button', { name: 'Filters, 3 active' }))
    const again = within(await screen.findByRole('dialog'))
    fireEvent.click(again.getByRole('button', { name: 'Clear' }))
    expect(again.getByText('5 products')).toBeInTheDocument()
    fireEvent.click(again.getByRole('button', { name: 'Show results' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument()
    expect(cardsInOrder()).toHaveLength(5)
  })
})
