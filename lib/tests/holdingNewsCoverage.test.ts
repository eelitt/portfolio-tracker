import { describe, it, expect } from 'vitest'
import {
  isUncoveredSymbol,
  hasUncoveredHoldings,
  symbolsEligibleForExtendedLookback,
  resolveNewsKeyToSymbol,
  normalizeHoldingNews,
  computeNewsWindowDays,
  HOLDING_NEWS_EXTENDED_LOOKBACK_DAYS,
} from '../../app/actions/ai/holding-news/newsUtils'

describe('isUncoveredSymbol / hasUncoveredHoldings', () => {
  it('missing key is uncovered', () => {
    expect(isUncoveredSymbol('AAPL', { LINK: ['x'] })).toBe(true)
    expect(hasUncoveredHoldings(['LINK', 'AAPL'], { LINK: ['x'] })).toBe(true)
  })

  it('empty array key is covered (first search already ran)', () => {
    expect(isUncoveredSymbol('AAPL', { LINK: ['x'], AAPL: [] })).toBe(false)
    expect(hasUncoveredHoldings(['LINK', 'AAPL'], { LINK: ['x'], AAPL: [] })).toBe(
      false
    )
  })

  it('null previous → all uncovered', () => {
    expect(isUncoveredSymbol('LINK', null)).toBe(true)
    expect(hasUncoveredHoldings(['LINK'], null)).toBe(true)
  })
})

describe('symbolsEligibleForExtendedLookback', () => {
  it('only first-time empties (not prior empty, not prior bullets)', () => {
    const previous = { LINK: ['L1'], BTC: [] }
    const afterPass = { LINK: ['L1'], BTC: [], AAPL: [], ETH: ['e'] }
    const eligible = symbolsEligibleForExtendedLookback(
      ['LINK', 'BTC', 'AAPL', 'ETH'],
      previous,
      afterPass
    )
    // AAPL missing from previous and empty after pass → eligible
    // BTC covered as [] → not eligible
    // LINK / ETH have bullets → not eligible
    expect(eligible).toEqual(['AAPL'])
  })

  it('no eligible when all covered', () => {
    const previous = { LINK: ['L1'], AAPL: [] }
    const afterPass = { LINK: ['L1'], AAPL: [] }
    expect(
      symbolsEligibleForExtendedLookback(['LINK', 'AAPL'], previous, afterPass)
    ).toEqual([])
  })
})

describe('normalizeHoldingNews name → ticker', () => {
  const holdings = [
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'LINK', name: 'Chainlink' },
  ]

  it('maps company name keys to tickers', () => {
    const out = normalizeHoldingNews(
      { Apple: ['earnings beat'], LINK: ['oracle upgrade'] },
      ['AAPL', 'LINK'],
      holdings
    )
    expect(out.AAPL).toEqual(['earnings beat'])
    expect(out.LINK).toEqual(['oracle upgrade'])
  })
})

describe('resolveNewsKeyToSymbol', () => {
  const holdings = [{ symbol: 'AAPL', name: 'Apple Inc.' }]
  it('ticker and name', () => {
    expect(resolveNewsKeyToSymbol('AAPL', holdings)).toBe('AAPL')
    expect(resolveNewsKeyToSymbol('Apple', holdings)).toBe('AAPL')
  })
})

describe('computeNewsWindowDays', () => {
  it('uses extended lookback constant for 14d', () => {
    const w = computeNewsWindowDays(HOLDING_NEWS_EXTENDED_LOOKBACK_DAYS)
    expect(w.lookbackDays).toBe(14)
    expect(w.fromDate < w.toDate || w.fromDate === w.toDate).toBe(true)
  })
})
