'use server'

/**
 * Price fetching service.
 *
 * All functions are marked 'use server' because they are called from
 * Server Components / Server Actions and use Next.js fetch caching
 * (revalidate: 60).
 *
 * Stock prices come from Finnhub (requires FINNHUB_API_KEY).
 * Crypto is limited to a hardcoded list via CoinGecko (no API key needed).
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
    console.log(`Fetched price for ${symbol}:`, data.c)
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
 * Fetches price for a supported crypto symbol.
 *
 * Only a small curated list is supported because CoinGecko's free tier
 * works best with well-known ids and we map tickers manually.
 * Unknown symbols return null immediately (no network call).
 */
export async function getCryptoPrice(symbol: string): Promise<{ price: number; change24h: number | null } | null> {
  // Hardcoded mapping of common ticker → CoinGecko id.
  // Extend this map when you want to support more cryptos.
  const cryptoMap: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    ADA: 'cardano',
    XRP: 'ripple',
    DOGE: 'dogecoin',
    CHAINLINK: 'chainlink',
  }

  const id = cryptoMap[symbol.toUpperCase()]
  if (!id) return null

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`,
      { next: { revalidate: 60 } }
    )

    if (!res.ok) return null

    const data = await res.json()
    console.log(`Fetched price for ${symbol}:`, data[id]?.usd)
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
  holdings: { symbol: string; asset_type: 'stock' | 'crypto' }[]
): Promise<Record<string, { price: number; change24h: number | null }>> {
  const priceData: Record<string, { price: number; change24h: number | null }> = {}

  const promises = holdings.map(async (holding) => {
    const result =
      holding.asset_type === 'stock'
        ? await getStockPrice(holding.symbol)
        : await getCryptoPrice(holding.symbol)

    if (result && result.price !== null) {
      priceData[holding.symbol] = result
    }
  })

  await Promise.all(promises)
  return priceData
}