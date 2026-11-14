import { describe, expect, it } from 'vitest'
import { askedText, callTime, figureLabel, toolLabel } from '@/admin/aiUsageFormat'

describe('askedText', () => {
  it('says the bands with what they are and the choices in words', () => {
    expect(
      askedText({
        income: '100-150k',
        price: '350-450k',
        goalKinds: ['house_deposit'],
        propertyKind: 'second_hand',
        buyingTogether: true,
      }),
    ).toBe('income 100-150k · price 350-450k · house deposit · second hand · buying together')
  })

  it('keeps search words and an id as given, numbers with their name', () => {
    expect(askedText({ category: 'deposit', horizonMonths: 24, providers: ['boi', 'aib'] })).toBe(
      'deposit · horizonMonths 24 · boi, aib',
    )
    expect(askedText({ id: 'boi:savings.supersaver' })).toBe('boi:savings.supersaver')
    expect(askedText({ focus: 'saving for a house' })).toBe('“saving for a house”')
  })

  it('is empty when nothing was recorded', () => {
    expect(askedText({})).toBe('')
    expect(askedText({ goalKinds: [], price: null })).toBe('')
  })
})

describe('labels', () => {
  it('names tools, figures and times plainly', () => {
    expect(toolLabel('saoi_home_calculator')).toBe('home calculator')
    expect(toolLabel('saoi://about/earnings')).toBe('saoi://about/earnings')
    expect(figureLabel('annualGrossIncomeEur')).toBe('Income')
    expect(figureLabel('somethingNew')).toBe('somethingNew')
    expect(callTime('2026-11-14T10:05:00.000Z')).toMatch(/14 Nov.*10:05/)
  })
})
