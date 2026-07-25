/**
 * Map portfolio crypto tickers to Binance spot symbols (USDT quote).
 * Prefers curated catalog (`cryptos.json`); falls back to convention for legacy holdings.
 * Returns undefined for stables / unpriceable bases (do not call Binance).
 */

import { getCryptoPricing } from '@/lib/symbols'

/**
 * Portfolio ticker (e.g. BTC) → Binance spot pair (e.g. BTCUSDT).
 * Undefined = stable face value or no pair.
 */
export function getBinanceSpotSymbol(ticker: string): string | undefined {
  const pricing = getCryptoPricing(ticker)
  if (pricing.kind === 'binance') return pricing.pair
  return undefined
}
