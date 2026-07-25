import { describe, it, expect } from 'vitest'
import { getHoldingLogoCandidates } from '@/app/(app)/dashboard/holdings/holdingLogo'

describe('getHoldingLogoCandidates', () => {
  it('returns svg then png under crypto folder for tickers', () => {
    expect(getHoldingLogoCandidates('BTC', 'crypto')).toEqual([
      '/holdings/logos/crypto/btc.svg',
      '/holdings/logos/crypto/btc.png',
    ])
    expect(getHoldingLogoCandidates('link', 'crypto')[0]).toBe(
      '/holdings/logos/crypto/link.svg'
    )
  })

  it('uses stock and etf folders', () => {
    expect(getHoldingLogoCandidates('AAPL', 'stock')).toEqual([
      '/holdings/logos/stock/aapl.svg',
      '/holdings/logos/stock/aapl.png',
    ])
    expect(getHoldingLogoCandidates('SPY', 'etf')[0]).toBe(
      '/holdings/logos/etf/spy.svg'
    )
  })

  it('returns empty for cash and blank symbols', () => {
    expect(getHoldingLogoCandidates('USD', 'cash')).toEqual([])
    expect(getHoldingLogoCandidates('', 'crypto')).toEqual([])
  })
})
