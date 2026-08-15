/**
 * Unit tests for news holdings selection (agent symbol filter).
 */

import { describe, it, expect } from 'vitest'
import {
  resolveNewsHoldings,
  resolveNewsTargets,
  newsFeatureType,
  HOLDING_NEWS_FEATURE_TYPE,
  WATCHLIST_NEWS_FEATURE_TYPE,
} from '../../app/actions/ai/holding-news/newsUtils'
import type { PortfolioData } from '../portfolioData'

function mockData(symbols: Array<{ symbol: string; mv: number; type?: string }>): PortfolioData {
  return {
    transactions: [],
    enrichedHoldings: symbols.map((s) => ({
      symbol: s.symbol,
      asset_type: s.type ?? 'stock',
      quantity: 1,
      avgCost: 1,
      totalCost: 1,
      realizedPnl: 0,
      currentPrice: s.mv,
      marketValue: s.mv,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      change24h: 0,
      position24hChange: 0,
      priceAvailable: true,
    })),
    priceData: {},
    holdingsCount: symbols.length,
    assetCount: symbols.length,
    pricedAssetCount: symbols.length,
    unpricedSymbols: [],
    totalMarketValue: symbols.reduce((a, s) => a + s.mv, 0),
    totalCost: symbols.length,
    totalUnrealizedPnl: 0,
    total24hChange: 0,
    total24hChangePercent: 0,
    preferredCurrency: 'USD',
    usdToPreferredRate: 1,
    usdToEurRate: 0.92,
    error: null,
  }
}

describe('resolveNewsHoldings', () => {
  it('returns top holdings by MV when no symbols filter', () => {
    const data = mockData([
      { symbol: 'AAPL', mv: 100 },
      { symbol: 'NVDA', mv: 500 },
      { symbol: 'MSFT', mv: 200 },
    ])
    const h = resolveNewsHoldings(data)
    expect(h[0].symbol).toBe('NVDA')
    expect(h.map((x) => x.symbol)).toContain('MSFT')
  })

  it('filters to requested symbols that exist', () => {
    const data = mockData([
      { symbol: 'AAPL', mv: 100 },
      { symbol: 'NVDA', mv: 500 },
    ])
    const h = resolveNewsHoldings(data, ['nvda', 'ZZZ'])
    expect(h).toHaveLength(1)
    expect(h[0].symbol).toBe('NVDA')
  })
})

describe('resolveNewsTargets', () => {
  it('uses watchlist when universe is watchlist', () => {
    const data = mockData([{ symbol: 'AAPL', mv: 100 }])
    const t = resolveNewsTargets({
      data,
      universe: 'watchlist',
      watchlist: [
        { symbol: 'BNB', asset_type: 'crypto' },
        { symbol: 'SOL', asset_type: 'crypto' },
      ],
    })
    expect(t.map((x) => x.symbol)).toEqual(['BNB', 'SOL'])
  })

  it('does not mix watchlist tickers into the holdings universe', () => {
    const data = mockData([{ symbol: 'AAPL', mv: 100 }])
    const t = resolveNewsTargets({
      data,
      symbols: ['BNB'],
      watchlist: [{ symbol: 'BNB', asset_type: 'crypto' }],
    })
    expect(t).toHaveLength(0)
  })

  it('uses a separate storage key per universe', () => {
    expect(newsFeatureType('holdings')).toBe(HOLDING_NEWS_FEATURE_TYPE)
    expect(newsFeatureType('watchlist')).toBe(WATCHLIST_NEWS_FEATURE_TYPE)
    expect(newsFeatureType('watchlist')).not.toBe(newsFeatureType('holdings'))
  })
})
