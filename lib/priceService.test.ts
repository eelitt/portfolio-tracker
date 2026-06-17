import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getCryptoPrice, getPricesForHoldings } from './priceService'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('priceService', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getCryptoPrice', () => {
    it('should return null for unknown crypto symbols', async () => {
      const price = await getCryptoPrice('UNKNOWN')
      expect(price).toBeNull()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should fetch and return crypto price correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ bitcoin: { usd: 65000 } }),
      })

      const price = await getCryptoPrice('BTC')
      expect(price?.price).toBe(65000)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('bitcoin'),
        expect.any(Object)
      )
    })

    it('should return null if API response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      })

      const price = await getCryptoPrice('ETH')
      expect(price).toBeNull()
    })

    it('should return null on fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const price = await getCryptoPrice('SOL')
      expect(price).toBeNull()
    })
  })

  describe('getPricesForHoldings', () => {
    it('should fetch prices for mixed stock and crypto holdings', async () => {
      // Mock crypto responses only (stocks would need real API key)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ bitcoin: { usd: 62000 } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ethereum: { usd: 2800 } }),
        })

      const holdings = [
        { symbol: 'BTC', asset_type: 'crypto' as const },
        { symbol: 'ETH', asset_type: 'crypto' as const },
        { symbol: 'AAPL', asset_type: 'stock' as const }, // will be skipped in mock
      ]

      const prices = await getPricesForHoldings(holdings)

      expect(prices).toEqual({
    BTC: { price: 62000, change24h: null },
    ETH: { price: 2800, change24h: null },
  })
    })

    it('should return empty object when no valid prices are fetched', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
      })

      const holdings = [
        { symbol: 'BTC', asset_type: 'crypto' as const },
      ]

      const prices = await getPricesForHoldings(holdings)
      expect(prices).toEqual({})
    })
  })
})