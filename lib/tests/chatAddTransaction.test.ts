import { describe, it, expect } from 'vitest'
import {
  detectCurrencyFromText,
  resolveCatalogSymbol,
  validateTransactionDraft,
  sellExceedsHoldingWarning,
} from '../portfolioAnalyst'

describe('detectCurrencyFromText', () => {
  it('detects $ and USD', () => {
    expect(detectCurrencyFromText('Bought ETH at $3180')).toBe('USD')
    expect(detectCurrencyFromText('price 100 usd')).toBe('USD')
    expect(detectCurrencyFromText('100 dollars')).toBe('USD')
  })

  it('detects € and EUR', () => {
    expect(detectCurrencyFromText('Bought ETH at €3000')).toBe('EUR')
    expect(detectCurrencyFromText('price 100 eur')).toBe('EUR')
    expect(detectCurrencyFromText('100 euros')).toBe('EUR')
  })

  it('returns null when no marker', () => {
    expect(detectCurrencyFromText('Bought 1.2 ETH at 3180')).toBe(null)
  })

  it('returns ambiguous when both present', () => {
    expect(detectCurrencyFromText('paid $100 or €90')).toBe('ambiguous')
  })
})

describe('resolveCatalogSymbol', () => {
  it('resolves BTC ticker', () => {
    const r = resolveCatalogSymbol('btc')
    expect(r).toEqual({ symbol: 'BTC', assetType: 'crypto' })
  })

  it('resolves Bitcoin by name', () => {
    const r = resolveCatalogSymbol('Bitcoin')
    expect(r).toEqual({ symbol: 'BTC', assetType: 'crypto' })
  })

  it('returns null for unknown', () => {
    expect(resolveCatalogSymbol('NOTAREALTICKERXYZ')).toBe(null)
  })
})

describe('validateTransactionDraft', () => {
  const base = {
    sourceText: 'Bought 1.2 ETH at $3180 yesterday',
    symbol: 'ETH',
    asset_type: 'crypto' as const,
    action: 'buy' as const,
    quantity: 1.2,
    unit_price: 3180,
    executed_at: '2026-07-20T12:00:00.000Z',
  }

  it('is ready when all fields + $ present', () => {
    const r = validateTransactionDraft(base)
    expect(r.status).toBe('ready')
    expect(r.draft?.currency).toBe('USD')
    expect(r.draft?.symbol).toBe('ETH')
    expect(r.summary).toMatch(/BUY/)
  })

  it('is incomplete without currency marker', () => {
    const r = validateTransactionDraft({
      ...base,
      sourceText: 'Bought 1.2 ETH at 3180 yesterday',
    })
    expect(r.status).toBe('incomplete')
    expect(r.missing).toContain('currency')
    expect(r.draft).toBeUndefined()
  })

  it('is incomplete without symbol', () => {
    const r = validateTransactionDraft({
      ...base,
      symbol: '',
      sourceText: 'Bought 1.2 at $3180',
    })
    expect(r.status).toBe('incomplete')
    expect(r.missing).toContain('symbol')
  })

  it('is invalid for unknown symbol', () => {
    const r = validateTransactionDraft({
      ...base,
      symbol: 'ZZZZNOTREAL',
      sourceText: 'Bought ZZZZNOTREAL at $10',
    })
    expect(r.status).toBe('invalid')
    expect(r.errors.some((e) => e.toLowerCase().includes('catalog'))).toBe(true)
  })

  it('is invalid when both currencies present', () => {
    const r = validateTransactionDraft({
      ...base,
      sourceText: 'Bought ETH at $100 or €90',
    })
    expect(r.status).toBe('invalid')
    expect(r.errors.some((e) => e.toLowerCase().includes('both'))).toBe(true)
  })

  it('rejects cash with buy action', () => {
    const r = validateTransactionDraft({
      sourceText: 'buy cash $500',
      symbol: 'Available Cash',
      asset_type: 'cash',
      action: 'buy',
      quantity: 500,
      unit_price: 1,
    })
    expect(r.status).toBe('invalid')
    expect(r.errors.some((e) => e.toLowerCase().includes('inflow'))).toBe(true)
  })

  it('accepts cash inflow with €', () => {
    const r = validateTransactionDraft({
      sourceText: 'deposited €500 to cash',
      asset_type: 'cash',
      action: 'inflow',
      quantity: 500,
      unit_price: 1,
    })
    expect(r.status).toBe('ready')
    expect(r.draft?.symbol).toBe('Available Cash')
    expect(r.draft?.currency).toBe('EUR')
    expect(r.draft?.unit_price).toBe(1)
  })

  it('assumes now when date missing', () => {
    const r = validateTransactionDraft({
      ...base,
      executed_at: null,
    })
    expect(r.status).toBe('ready')
    expect(r.warnings.some((w) => w.toLowerCase().includes('date'))).toBe(true)
  })

  it('currency from text overrides wrong model currency', () => {
    const r = validateTransactionDraft({
      ...base,
      sourceText: 'Bought ETH at €3000',
      unit_price: 3000,
      currency: 'USD',
    })
    expect(r.status).toBe('ready')
    expect(r.draft?.currency).toBe('EUR')
  })
})

describe('sellExceedsHoldingWarning', () => {
  it('warns when sell > held', () => {
    const msg = sellExceedsHoldingWarning(
      {
        symbol: 'ETH',
        asset_type: 'crypto',
        action: 'sell',
        quantity: 10,
        unit_price: 100,
        executed_at: new Date().toISOString(),
        currency: 'USD',
        currencySource: 'text',
      },
      2
    )
    expect(msg).toMatch(/greater than/)
  })

  it('silent when ok', () => {
    expect(
      sellExceedsHoldingWarning(
        {
          symbol: 'ETH',
          asset_type: 'crypto',
          action: 'sell',
          quantity: 1,
          unit_price: 100,
          executed_at: new Date().toISOString(),
          currency: 'USD',
          currencySource: 'text',
        },
        5
      )
    ).toBeNull()
  })
})
