/** Shared Binance REST base URL (spot). */

const DEFAULT_BASE = 'https://api.binance.com'

export function binanceBaseUrl(): string {
  const raw =
    process.env.BINANCE_API_BASE ||
    process.env.NEXT_PUBLIC_BINANCE_API_BASE ||
    DEFAULT_BASE
  return raw.replace(/\/$/, '')
}
