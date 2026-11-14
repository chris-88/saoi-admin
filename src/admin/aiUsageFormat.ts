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

/**
 * What was asked, in one short line: the bands with what they are, the search words as given.
 * Empty when nothing was recorded.
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
      else if (value) parts.push(words(key))
      continue
    }
    switch (key) {
      case 'income':
        parts.push(`income ${String(value)}`)
        break
      case 'price':
        parts.push(`price ${String(value)}`)
        break
      case 'rent':
        parts.push(`rent ${String(value)}`)
        break
      case 'focus':
        parts.push(`“${String(value)}”`)
        break
      default:
        parts.push(typeof value === 'string' ? words(value) : `${words(key)} ${String(value)}`)
    }
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
