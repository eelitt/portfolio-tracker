'use server'

import { unstable_cache } from 'next/cache'

/// ==================== STOCKS (Finnhub) ====================
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
export async function getCryptoPrice(symbol: string): Promise<{ price: number; change24h: number | null } | null> {
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