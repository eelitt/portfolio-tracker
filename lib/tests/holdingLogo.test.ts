import { describe, it, expect } from 'vitest'
import { getHoldingLogoCandidates } from '@/app/(app)/dashboard/holdings/holdingLogo'

describe('getHoldingLogoCandidates', () => {
  it('returns svg then png under crypto folder for tickers', () => {
    const btc = getHoldingLogoCandidates('BTC', 'crypto')
    expect(btc[0]).toBe('/holdings/logos/crypto/btc.svg')
    expect(btc).toContain('/holdings/logos/crypto/btc.png')
    expect(getHoldingLogoCandidates('link', 'crypto')[0]).toBe(
      '/holdings/logos/crypto/link.svg'
    )
  })

  it('uses stock and etf folders', () => {
    expect(getHoldingLogoCandidates('AAPL', 'stock')[0]).toBe(
      '/holdings/logos/stock/aapl.svg'
    )
    expect(getHoldingLogoCandidates('SPY', 'etf')[0]).toBe(
      '/holdings/logos/etf/spy.svg'
    )
  })

  it('also tries a catalog name slug (tesla.svg for TSLA)', () => {
    const paths = getHoldingLogoCandidates('TSLA', 'stock')
    expect(paths).toContain('/holdings/logos/stock/tsla.svg')
    expect(paths).toContain('/holdings/logos/stock/tesla.svg')
  })

  it('returns empty for cash and blank symbols', () => {
    expect(getHoldingLogoCandidates('USD', 'cash')).toEqual([])
    expect(getHoldingLogoCandidates('', 'crypto')).toEqual([])
  })
})
