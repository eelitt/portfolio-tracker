'use server'

import { unstable_cache } from 'next/cache'

// ==================== STOCKS (Finnhub) ====================
export async function getStockPrice(symbol: string): Promise<number | null> {
  const apiKey = process.env.FINNHUB_API_KEY

  if (!apiKey) {
    console.error('Missing FINNHUB_API_KEY')
    return null
  }

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`,
      { next: { revalidate: 60 } } // cache for 60 seconds
    )

    if (!res.ok) return null

    const data = await res.json()
    console.log(`Fetched price for ${symbol}:`, data.c)
    return data.c ?? null // current price
  } catch (error) {
    console.error('Stock price fetch error:', error)
    return null
  }
}

// ==================== CRYPTO (CoinGecko) ====================
export async function getCryptoPrice(symbol: string): Promise<number | null> {
  // Map common symbols to CoinGecko IDs
  const cryptoMap: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    ADA: 'cardano',
    XRP: 'ripple',
    DOGE: 'dogecoin',
    LINK: 'chainlink',
  }

  const id = cryptoMap[symbol.toUpperCase()]
  if (!id) return null

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
      { next: { revalidate: 60 } }
    )

    if (!res.ok) return null

    const data = await res.json()
    console.log(`Fetched price for ${symbol}:`, data[id]?.usd)
    return data[id]?.usd ?? null
  } catch (error) {
    console.error('Crypto price fetch error:', error)
    return null
  }
}

// ==================== BATCH FETCH ====================
export async function getPricesForHoldings(
  holdings: { symbol: string; asset_type: 'stock' | 'crypto' }[]
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {}

  const promises = holdings.map(async (holding) => {
    const price =
      holding.asset_type === 'stock'
        ? await getStockPrice(holding.symbol)
        : await getCryptoPrice(holding.symbol)

    if (price !== null) {
      prices[holding.symbol] = price
    }
  })

  await Promise.all(promises)
  return prices
}