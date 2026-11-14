import type { AiUsageCall } from '@contracts/admin.ts'
import type { McpHost } from '@contracts/telemetry.ts'

/** The assistants as the console names them, in the host map's order. */
export const HOST_LABELS: Readonly<Record<McpHost, string>> = {
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  cursor: 'Cursor',
  other: 'Other',
}

/** The figures the home calculator's gate waits for, as a person would say them. */
const FIGURES: Readonly<Record<string, string>> = {
  annualGrossIncomeEur: 'Income',
  secondIncomeEur: 'Second income',
  targetPriceEur: 'Price',
  targetDate: 'Date',
  depositSavedEur: 'Funds saved',
  monthlySavingEur: 'Monthly saving',
}

export const figureLabel = (key: string): string => FIGURES[key] ?? key

/** `saoi_home_calculator` reads as "home calculator"; a resource keeps its address. */
export function toolLabel(name: string): string {
  return name.startsWith('saoi_') ? name.slice(5).replaceAll('_', ' ') : name
}

const words = (value: string): string => value.replaceAll('_', ' ')

/** camelCase or snake_case to lower-case words: `maxNoticeDays` reads "max notice days". */
export const keyWords = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .toLowerCase()

/** How each recorded number reads; anything else is its key in words, then the number. */
const NUMBERS: Readonly<Record<string, (value: number) => string>> = {
  horizonMonths: (n) => `${String(n)} months`,
  termMonths: (n) => `${String(n)}-month term`,
  termYears: (n) => `${String(n)}-year term`,
  maxNoticeDays: (n) => `up to ${String(n)} days' notice`,
}

/** Bands said with what they are. */
const BANDS: Readonly<Record<string, string>> = { income: 'income', price: 'price', rent: 'rent' }

/** Plain choices whose value says it all (`category: deposit` reads "deposit"). */
const PLAIN = new Set([
  'category',
  'access',
  'objective',
  'purpose',
  'buyerType',
  'ber',
  'propertyKind',
  'mode',
  'buyer',
  'id',
  'topic',
])

/**
 * What was asked, in one short line: the bands with what they are, search words as given, and
 * no raw key ever (an unknown key is split into words). Empty when nothing was recorded.
 */
export function askedText(asked: AiUsageCall['asked']): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(asked)) {
    if (value === null || value === '') continue
    if (Array.isArray(value)) {
      if (value.length > 0) parts.push(value.map(words).join(', '))
      continue
    }
    if (typeof value === 'boolean') {
      if (key === 'buyingTogether') parts.push(value ? 'buying together' : 'buying alone')
      else if (key === 'saidGiven') parts.push(value ? 'with what was said' : 'nothing said yet')
      else if (value) parts.push(keyWords(key))
      continue
    }
    if (typeof value === 'number') {
      const say = NUMBERS[key]
      parts.push(say === undefined ? `${keyWords(key)} ${String(value)}` : say(value))
      continue
    }
    const band = BANDS[key]
    if (band !== undefined) parts.push(`${band} ${value}`)
    else if (key === 'focus') parts.push(`“${value}”`)
    else if (PLAIN.has(key)) parts.push(key === 'id' ? value : words(value))
    else parts.push(`${keyWords(key)} ${words(value)}`)
  }
  return parts.join(' · ')
}

/** A call's time on the console's clock: Dublin, day and minute. */
export function callTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IE', {
    timeZone: 'Europe/Dublin',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
