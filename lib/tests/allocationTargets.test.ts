import { describe, expect, it } from 'vitest'
import type { EnrichedHolding } from '../types'
import {
  computeDrift,
  formatContributionContext,
  formatContributionLabel,
  suggestMixFromProfile,
  suggestRebalance,
  validatePolicySpec,
} from '../allocationTargets'

function eh(
  partial: Partial<EnrichedHolding> & Pick<EnrichedHolding, 'symbol'>
): EnrichedHolding {
  const qty = partial.quantity ?? 1
  const price = partial.currentPrice ?? 100
  return {
    symbol: partial.symbol,
    asset_type: partial.asset_type ?? 'stock',
    quantity: qty,
    avgCost: partial.avgCost ?? price,
    totalCost: partial.totalCost ?? qty * price,
    realizedPnl: 0,
    currency: 'USD',
    currentPrice: price,
    marketValue: partial.marketValue ?? qty * price,
    unrealizedPnl: 0,
    unrealizedPnlPercent: 0,
    change24h: 0,
    position24hChange: 0,
    priceAvailable: partial.priceAvailable ?? true,
  }
}

describe('validatePolicySpec', () => {
  it('requires type weights to sum to 100', () => {
    const r = validatePolicySpec({
      typeWeights: { stock: 50, etf: 20, crypto: 10, cash: 10 },
    })
    expect(r.ok).toBe(false)
  })

  it('rejects symbol overrides that exceed their type bucket', () => {
    const r = validatePolicySpec({
      typeWeights: { stock: 40, etf: 20, crypto: 20, cash: 20 },
      symbolOverrides: [
        { symbol: 'BTC', assetType: 'crypto', weightPercent: 15 },
        { symbol: 'ETH', assetType: 'crypto', weightPercent: 10 },
      ],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/crypto/)
  })

  it('accepts a valid book', () => {
    const r = validatePolicySpec({
      typeWeights: { stock: 40, etf: 20, crypto: 25, cash: 15 },
      symbolOverrides: [{ symbol: 'btc', assetType: 'crypto', weightPercent: 15 }],
      tolerancePp: 5,
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.spec.symbolOverrides[0].symbol).toBe('BTC')
  })
})

describe('computeDrift', () => {
  const spec = validatePolicySpec({
    typeWeights: { stock: 50, etf: 0, crypto: 30, cash: 20 },
    symbolOverrides: [{ symbol: 'BTC', assetType: 'crypto', weightPercent: 20 }],
    tolerancePp: 5,
  })
  if (!spec.ok) throw new Error(spec.error)

  it('marks type and symbol over/under outside the band', () => {
    const drift = computeDrift(
      [
        eh({ symbol: 'AAPL', asset_type: 'stock', marketValue: 70, currentPrice: 70 }),
        eh({ symbol: 'BTC', asset_type: 'crypto', marketValue: 20, currentPrice: 20 }),
        eh({
          symbol: 'Available Cash',
          asset_type: 'cash',
          marketValue: 10,
          currentPrice: 1,
          quantity: 10,
        }),
      ],
      spec.spec
    )
    expect(drift.totalMarketValue).toBe(100)
    const stock = drift.byType.find((r) => r.key === 'stock')
    const cash = drift.byType.find((r) => r.key === 'cash')
    const btc = drift.bySymbol.find((r) => r.key === 'BTC')
    expect(stock?.status).toBe('over')
    expect(cash?.status).toBe('under')
    expect(btc?.status).toBe('ok')
  })

  it('excludes unpriced names from current weights', () => {
    const drift = computeDrift(
      [
        eh({ symbol: 'AAPL', asset_type: 'stock', marketValue: 100, currentPrice: 100 }),
        eh({
          symbol: 'DEAD',
          asset_type: 'stock',
          priceAvailable: false,
          marketValue: 0,
          currentPrice: 0,
          totalCost: 50,
        }),
      ],
      spec.spec
    )
    expect(drift.unpricedSymbols).toContain('DEAD')
    expect(drift.totalMarketValue).toBe(100)
  })
})

describe('suggestRebalance', () => {
  const spec = validatePolicySpec({
    typeWeights: { stock: 40, etf: 0, crypto: 40, cash: 20 },
    tolerancePp: 5,
  })
  if (!spec.ok) throw new Error(spec.error)

  it('funds underweights from excess cash first (no sells)', () => {
    const r = suggestRebalance(
      [
        eh({ symbol: 'AAPL', asset_type: 'stock', marketValue: 40, currentPrice: 40 }),
        eh({ symbol: 'BTC', asset_type: 'crypto', marketValue: 20, currentPrice: 20 }),
        eh({
          symbol: 'Available Cash',
          asset_type: 'cash',
          quantity: 40,
          currentPrice: 1,
          marketValue: 40,
        }),
      ],
      spec.spec,
      { mode: 'inplace' }
    )
    expect(r.suggestions.some((s) => s.side === 'sell')).toBe(false)
    const buyCrypto = r.suggestions.find((s) => s.side === 'buy' && s.key === 'crypto')
    expect(buyCrypto).toBeDefined()
    expect(buyCrypto!.reason).toMatch(/cash/i)
  })

  it('new_cash only emits buys', () => {
    const r = suggestRebalance(
      [
        eh({ symbol: 'AAPL', asset_type: 'stock', marketValue: 80, currentPrice: 80 }),
        eh({ symbol: 'BTC', asset_type: 'crypto', marketValue: 20, currentPrice: 20 }),
      ],
      spec.spec,
      { mode: 'new_cash', cashIn: 50 }
    )
    expect(r.suggestions.length).toBeGreaterThan(0)
    expect(r.suggestions.every((s) => s.side === 'buy')).toBe(true)
  })

  it('hides noise inside the tolerance band', () => {
    const tight = validatePolicySpec({
      typeWeights: { stock: 50, etf: 0, crypto: 50, cash: 0 },
      tolerancePp: 10,
    })
    if (!tight.ok) throw new Error(tight.error)
    const r = suggestRebalance(
      [
        eh({ symbol: 'AAPL', asset_type: 'stock', marketValue: 54, currentPrice: 54 }),
        eh({ symbol: 'BTC', asset_type: 'crypto', marketValue: 46, currentPrice: 46 }),
      ],
      tight.spec,
      { mode: 'inplace' }
    )
    expect(r.suggestions).toEqual([])
  })
})

describe('suggestMixFromProfile', () => {
  it('requires risk and horizon', () => {
    const r = suggestMixFromProfile({ ageBand: 'under_30' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.missing).toContain('riskTolerance')
  })

  it('returns a 100% template and tilts older investors toward cash', () => {
    const base = suggestMixFromProfile({
      riskTolerance: 'moderate',
      horizon: 'gt_10y',
    })
    const older = suggestMixFromProfile({
      riskTolerance: 'moderate',
      horizon: 'gt_10y',
      ageBand: '60_plus',
    })
    expect(base.ok && older.ok).toBe(true)
    if (!base.ok || !older.ok) return
    const sum = Object.values(older.typeWeights).reduce((s, n) => s + n, 0)
    expect(sum).toBe(100)
    expect(older.typeWeights.cash).toBeGreaterThan(base.typeWeights.cash)
    expect(older.typeWeights.crypto).toBeLessThan(base.typeWeights.crypto)
  })

  it('tilts larger monthly contributions toward cash', () => {
    const base = suggestMixFromProfile({
      riskTolerance: 'aggressive',
      horizon: 'gt_10y',
    })
    const saver = suggestMixFromProfile({
      riskTolerance: 'aggressive',
      horizon: 'gt_10y',
      monthlyContribution: '5000_plus',
    })
    expect(base.ok && saver.ok).toBe(true)
    if (!base.ok || !saver.ok) return
    expect(saver.typeWeights.cash).toBeGreaterThan(base.typeWeights.cash)
  })
})

describe('formatContributionLabel', () => {
  it('prefixes the preferred currency on ranges', () => {
    expect(formatContributionLabel('none', 'EUR')).toBe('None')
    expect(formatContributionLabel('500_1000', 'EUR')).toBe('€500–1,000')
    expect(formatContributionLabel('5000_plus', 'USD')).toBe('$5,000+')
    expect(formatContributionContext('1000_5000', 'EUR')).toBe(
      'contributes 1,000–5,000 EUR/month'
    )
  })
})
