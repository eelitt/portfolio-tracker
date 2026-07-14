'use server'

import { getCryptoId } from './symbols'

/**
 * Price fetching service.
 *
 * All functions are marked 'use server' because they are called from
 * Server Components / Server Actions and use Next.js fetch caching
 * (revalidate: 60).
 *
 * Stock / ETF prices come from Finnhub (requires FINNHUB_API_KEY).
 * Crypto prices come from CoinGecko using the curated list in lib/symbols/cryptos.json
 * (the "id" field supplies the CoinGecko slug; no API key needed).
 * Cash is always valued at 1 with 0 change.
 *
 * The import of `unstable_cache` is currently unused (fetch options provide
 * the caching we need).
 */

// ==================== STOCKS (Finnhub) ====================

/**
 * Fetches the latest quote for a stock symbol.
 * Returns current price ("c") and daily percent change ("dp").
 * Returns null on any failure (missing key, network error, bad response).
 */
export async function getStockPrice(symbol: string): Promise<{ price: number; change24h: number | null } | null> {
  const apiKey = process.env.FINNHUB_API_KEY

  if (!apiKey) {
    console.error('Missing FINNHUB_API_KEY')
    return null
  }

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`,
      { next: { revalidate: 60 } }
    )

    if (!res.ok) return null

    const data = await res.json()
    if (process.env.NODE_ENV === 'development') {
      console.log(`Fetched price for ${symbol}:`, data.c)
    }
    return {
      price: data.c ?? null,
      change24h: data.dp ?? null,
    }
  } catch (error) {
    console.error('Stock price fetch error:', error)
    return null
  }
}

// ==================== CRYPTO (CoinGecko) ====================

/**
 * Fetches price for a crypto symbol present in lib/symbols/cryptos.json.
 *
 * The CoinGecko id is looked up dynamically via getCryptoId().
 * Unknown symbols (not present in the curated list) return null immediately.
 */
export async function getCryptoPrice(symbol: string): Promise<{ price: number; change24h: number | null } | null> {
  const id = getCryptoId(symbol)
  if (!id) return null

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`,
      { next: { revalidate: 60 } }
    )

    if (!res.ok) return null

    const data = await res.json()
    if (process.env.NODE_ENV === 'development') {
      console.log(`Fetched price for ${symbol}:`, data[id]?.usd)
    }
    return {
      price: data[id]?.usd ?? null,
      change24h: data[id]?.usd_24h_change ?? null,
    }
  } catch (error) {
    console.error('Crypto price fetch error:', error)
    return null
  }
}

// ==================== BATCH FETCH ====================

/**
 * Given a list of holdings (symbol + type), fetches current prices
 * for all of them in parallel.
 *
 * Returns a map of symbol → {price, change24h}. Only symbols that
 * successfully returned a price are included.
 *
 * Failures for individual symbols are swallowed (we still want to
 * show the rest of the portfolio).
 */
export async function getPricesForHoldings(
  holdings: { symbol: string; asset_type: 'stock' | 'etf' | 'crypto' | 'cash' }[]
): Promise<Record<string, { price: number; change24h: number | null }>> {
  const priceData: Record<string, { price: number; change24h: number | null }> = {}

  const promises = holdings.map(async (holding) => {
    let result: { price: number; change24h: number | null } | null = null

    if (holding.asset_type === 'crypto') {
      result = await getCryptoPrice(holding.symbol)
    } else if (holding.asset_type === 'cash') {
      // Cash / savings has no market price — always valued at face value (1.0)
      result = { price: 1, change24h: 0 }
    } else {
      // 'stock' and 'etf' (index funds) both use stock market data (Finnhub)
      result = await getStockPrice(holding.symbol)
    }

    if (result && result.price !== null) {
      priceData[holding.symbol] = result
    }
  })

  await Promise.all(promises)
  return priceData
}