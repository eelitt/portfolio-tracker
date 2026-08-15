import { describe, it, expect } from 'vitest'
import {
  resolveWatchlistQuery,
  stripWatchlistFiller,
  isWatchableCatalogSymbol,
  openHoldingKeys,
} from '../portfolioAnalyst'

describe('stripWatchlistFiller', () => {
  it('keeps the name from an add command', () => {
    expect(stripWatchlistFiller('Add apple to the watchlist')).toBe('apple')
  })

  it('drops token from a crypto phrase', () => {
    expect(stripWatchlistFiller('add bnb token to the watchlist')).toBe('bnb')
  })
})

describe('resolveWatchlistQuery', () => {
  it('resolves apple to AAPL stock', () => {
    const r = resolveWatchlistQuery('Add apple to the watchlist')
    expect(r).toMatchObject({ ok: true, symbol: 'AAPL', assetType: 'stock' })
  })

  it('resolves bnb token to BNB crypto', () => {
    const r = resolveWatchlistQuery('add bnb token to the watchlist')
    expect(r).toMatchObject({ ok: true, symbol: 'BNB', assetType: 'crypto' })
  })

  it('resolves an exact ticker', () => {
    const r = resolveWatchlistQuery('AAPL')
    expect(r).toMatchObject({ ok: true, symbol: 'AAPL', assetType: 'stock' })
  })

  it('returns unknown for garbage', () => {
    const r = resolveWatchlistQuery('NOTAREALTICKERXYZ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failureMode).toBe('catalog_unknown')
  })

  it('rejects empty input', () => {
    const r = resolveWatchlistQuery('   ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failureMode).toBe('validation_invalid')
  })

  it('rejects a command with no symbol', () => {
    const r = resolveWatchlistQuery('add to the watchlist')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failureMode).toBe('validation_invalid')
  })

  it('asks when a name word matches several symbols', () => {
    const r = resolveWatchlistQuery('group')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failureMode).toBe('catalog_ambiguous')
  })
})

describe('openHoldingKeys', () => {
  it('includes open non-cash positions only', () => {
    const keys = openHoldingKeys([
      { symbol: 'aapl', asset_type: 'stock', quantity: 2 },
      { symbol: 'USD', asset_type: 'cash', quantity: 100 },
      { symbol: 'BNB', asset_type: 'crypto', quantity: 0 },
    ])
    expect(keys.has('stock:AAPL')).toBe(true)
    expect(keys.has('cash:USD')).toBe(false)
    expect(keys.has('crypto:BNB')).toBe(false)
  })
})

describe('isWatchableCatalogSymbol', () => {
  it('accepts catalog tickers and rejects cash/unknown', () => {
    expect(isWatchableCatalogSymbol('AAPL', 'stock')).toBe(true)
    expect(isWatchableCatalogSymbol('BNB', 'crypto')).toBe(true)
    expect(isWatchableCatalogSymbol('AAPL', 'crypto')).toBe(false)
    expect(isWatchableCatalogSymbol('NOPE', 'stock')).toBe(false)
  })
})
