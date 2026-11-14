import { describe, expect, it } from 'vitest'
import { askedText, callTime, figureLabel, keyWords, toolLabel } from '@/admin/aiUsageFormat'

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
      'deposit · 24 months · boi, aib',
    )
    expect(askedText({ id: 'boi:savings.supersaver' })).toBe('boi:savings.supersaver')
    expect(askedText({ focus: 'saving for a house' })).toBe('“saving for a house”')
  })

  it('never shows a raw key: known numbers read as phrases, unknown keys as words', () => {
    expect(askedText({ termYears: 30, maxNoticeDays: 31 })).toBe(
      "30-year term · up to 31 days' notice",
    )
    expect(askedText({ someNewCount: 3, newChoice: 'fixed_rate', keepAccessible: true })).toBe(
      'some new count 3 · new choice fixed rate · keep accessible',
    )
    expect(keyWords('annualGross_income')).toBe('annual gross income')
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
