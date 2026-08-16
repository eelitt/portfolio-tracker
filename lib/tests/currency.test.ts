import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  convertAmount,
  convertBetweenCurrencies,
  formatCurrency,
  formatQuantity,
  getAmountInUsd,
  getUsdToEurRate,
} from '../currency'

const RATE = 0.87

describe('FX helpers', () => {
  it('convertAmount is identity for USD and scales to EUR', () => {
    expect(convertAmount(100, 'USD', RATE)).toBe(100)
    expect(convertAmount(100, 'EUR', RATE)).toBeCloseTo(87, 8)
  })

  it('getAmountInUsd is identity for USD and divides EUR', () => {
    expect(getAmountInUsd(100, 'USD', RATE)).toBe(100)
    expect(getAmountInUsd(87, 'EUR', RATE)).toBeCloseTo(100, 8)
  })

  it('convertBetweenCurrencies is identity when from === to', () => {
    expect(convertBetweenCurrencies(50, 'EUR', 'EUR', RATE)).toBe(50)
    expect(convertBetweenCurrencies(50, 'USD', 'USD', RATE)).toBe(50)
  })

  it('converts EUR to USD and USD to EUR via the rate', () => {
    expect(convertBetweenCurrencies(87, 'EUR', 'USD', RATE)).toBeCloseTo(100, 8)
    expect(convertBetweenCurrencies(100, 'USD', 'EUR', RATE)).toBeCloseTo(87, 8)
  })
})

describe('formatCurrency / formatQuantity', () => {
  it('formats USD with space thousands and comma decimals', () => {
    expect(formatCurrency(1234.5, 'USD')).toBe('$1 234,50')
  })

  it('formats EUR and applies the FX rate', () => {
    expect(formatCurrency(100, 'EUR', RATE)).toBe('€87,00')
  })

  it('formats BTC with up to 8 decimals and trims trailing zeros', () => {
    expect(formatQuantity(0.000391, 'USD', { symbol: 'BTC' })).toBe('0,000391')
  })

  it('formats non-BTC quantities to 2 decimals', () => {
    expect(formatQuantity(1.2, 'USD', { symbol: 'ETH' })).toBe('1,20')
  })
})

describe('getUsdToEurRate', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('returns the Frankfurter EUR rate', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { EUR: 0.91 } }),
    })
    expect(await getUsdToEurRate()).toBe(0.91)
  })

  it('falls back to 0.92 when the response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    expect(await getUsdToEurRate()).toBe(0.92)
  })

  it('falls back to 0.92 when the rate is invalid', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { EUR: 0 } }),
    })
    expect(await getUsdToEurRate()).toBe(0.92)
  })

  it('falls back to 0.92 when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network'))
    expect(await getUsdToEurRate()).toBe(0.92)
  })
})
