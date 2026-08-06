import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parseYahooChartNav,
  buildYahooChartUrl,
  fetchYahooFundNav,
} from '../prices/yahooFund'

describe('parseYahooChartNav', () => {
  it('parses regularMarketPrice and day change from closes', () => {
    const payload = {
      chart: {
        result: [
          {
            meta: {
              currency: 'EUR',
              regularMarketPrice: 23.5481,
              chartPreviousClose: 23.4536,
            },
            indicators: {
              quote: [
                {
                  close: [23.7208, 23.8032, 23.4536, 23.5481],
                },
              ],
            },
          },
        ],
        error: null,
      },
    }
    const q = parseYahooChartNav(payload)
    expect(q).not.toBeNull()
    expect(q!.price).toBe(23.5481)
    expect(q!.currency).toBe('EUR')
    // (23.5481 - 23.4536) / 23.4536 * 100
    expect(q!.change24h).toBeCloseTo(0.4029, 2)
  })

  it('rejects missing or zero price', () => {
    expect(parseYahooChartNav({})).toBeNull()
    expect(
      parseYahooChartNav({
        chart: { result: [{ meta: { regularMarketPrice: 0 } }] },
      })
    ).toBeNull()
  })

  it('falls back to chartPreviousClose for change', () => {
    const q = parseYahooChartNav({
      chart: {
        result: [
          {
            meta: {
              currency: 'EUR',
              regularMarketPrice: 110,
              chartPreviousClose: 100,
            },
            indicators: { quote: [{ close: [null] }] },
          },
        ],
      },
    })
    expect(q!.price).toBe(110)
    expect(q!.change24h).toBe(10)
  })
})

describe('buildYahooChartUrl', () => {
  it('encodes yahoo symbol', () => {
    const url = buildYahooChartUrl('0P0001IFBB.F')
    expect(url).toContain('0P0001IFBB.F')
    expect(url).toContain('interval=1d')
    expect(url).toContain('range=5d')
  })
})

describe('fetchYahooFundNav', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('returns parsed quote on success', async () => {
    const mock = global.fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [
            {
              meta: {
                currency: 'EUR',
                regularMarketPrice: 23.5481,
                chartPreviousClose: 23.45,
              },
              indicators: { quote: [{ close: [23.45, 23.5481] }] },
            },
          ],
        },
      }),
    })

    const q = await fetchYahooFundNav('0P0001IFBB.F', { forceFresh: true })
    expect(q?.price).toBe(23.5481)
    expect(mock).toHaveBeenCalledWith(
      expect.stringContaining('0P0001IFBB.F'),
      expect.objectContaining({ headers: expect.any(Object) })
    )
  })

  it('returns null on HTTP failure', async () => {
    const mock = global.fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockResolvedValue({ ok: false, status: 404 })
    expect(await fetchYahooFundNav('BAD', { forceFresh: true })).toBeNull()
  })
})
