/**
 * Map portfolio crypto tickers to Binance spot symbols (USDT quote).
 * Returns undefined when we should not call Binance (stables / unknown bases).
 */

const STABLE_BASES = new Set([
  'USDT',
  'USDC',
  'BUSD',
  'DAI',
  'TUSD',
  'FDUSD',
  'USDE',
  'USDS',
  'USD',
])

/**
 * Portfolio ticker (e.g. BTC) → Binance spot pair (e.g. BTCUSDT).
 * Add a switch/override here if a ticker does not map to `${TICKER}USDT`.
 */
export function getBinanceSpotSymbol(ticker: string): string | undefined {
  const upper = (ticker || '').trim().toUpperCase()
  if (!upper) return undefined
  if (STABLE_BASES.has(upper)) return undefined
  // Already a pair?
  if (upper.endsWith('USDT') && upper.length > 4) return upper
  return `${upper}USDT`
}
