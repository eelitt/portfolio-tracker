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

/** Explicit overrides when `${TICKER}USDT` is wrong or missing. */
const BINANCE_PAIR_OVERRIDES: Record<string, string> = {
  // e.g. 'WBTC': 'WBTCUSDT',
}

/**
 * Portfolio ticker (e.g. BTC) → Binance spot pair (e.g. BTCUSDT).
 */
export function getBinanceSpotSymbol(ticker: string): string | undefined {
  const upper = (ticker || '').trim().toUpperCase()
  if (!upper) return undefined
  if (STABLE_BASES.has(upper)) return undefined
  if (BINANCE_PAIR_OVERRIDES[upper]) return BINANCE_PAIR_OVERRIDES[upper]
  // Already a pair?
  if (upper.endsWith('USDT') && upper.length > 4) return upper
  return `${upper}USDT`
}
