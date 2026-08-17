import type { PortfolioData } from '@/lib/portfolioData'
import { STOCK_SYMBOLS, ETF_SYMBOLS, CRYPTO_SYMBOLS } from '@/lib/symbols'
import { HOLDING_NEWS_MAX_HOLDINGS } from './constants'

export type NewsTarget = {
  symbol: string
  assetType: string
  name: string
}

export type NewsUniverse = 'holdings' | 'watchlist'

export function resolveAssetName(symbol: string, assetType: string): string {
  const upper = symbol.toUpperCase()
  if (assetType === 'crypto') {
    const found = CRYPTO_SYMBOLS.find((c) => c.symbol.toUpperCase() === upper)
    return found?.name ?? upper
  }
  if (assetType === 'etf') {
    const found = ETF_SYMBOLS.find((s) => s.symbol.toUpperCase() === upper)
    return found?.name ?? upper
  }
  const found = STOCK_SYMBOLS.find((s) => s.symbol.toUpperCase() === upper)
  return found?.name ?? upper
}

export function selectHoldingsForNews(
  data: PortfolioData
): NewsTarget[] {
  const nonCash = data.enrichedHoldings.filter((h) => h.asset_type !== 'cash')
  const sorted = [...nonCash].sort((a, b) => b.marketValue - a.marketValue)
  return sorted.slice(0, HOLDING_NEWS_MAX_HOLDINGS).map((h) => ({
    symbol: h.symbol.toUpperCase(),
    assetType: h.asset_type,
    name: resolveAssetName(h.symbol, h.asset_type),
  }))
}

function watchlistTargets(
  watchlist: Array<{ symbol: string; asset_type: string }>
): NewsTarget[] {
  const seen = new Set<string>()
  const out: NewsTarget[] = []
  for (const row of watchlist) {
    const symbol = row.symbol.toUpperCase()
    const key = `${row.asset_type}:${symbol}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      symbol,
      assetType: row.asset_type,
      name: resolveAssetName(row.symbol, row.asset_type),
    })
    if (out.length >= HOLDING_NEWS_MAX_HOLDINGS) break
  }
  return out
}

export function resolveNewsTargets(opts: {
  data: PortfolioData
  watchlist?: Array<{ symbol: string; asset_type: string }>
  symbols?: string[]
  universe?: NewsUniverse
}): NewsTarget[] {
  const watchlist = opts.watchlist ?? []
  const watched = watchlistTargets(watchlist)

  if (opts.universe === 'watchlist') {
    if (!opts.symbols?.length) return watched
    const want = new Set(
      opts.symbols.map((s) => s.toUpperCase().trim()).filter(Boolean)
    )
    return watched
      .filter((t) => want.has(t.symbol))
      .slice(0, HOLDING_NEWS_MAX_HOLDINGS)
  }

  if (!opts.symbols?.length) {
    return selectHoldingsForNews(opts.data)
  }

  const want = new Set(
    opts.symbols.map((s) => s.toUpperCase().trim()).filter(Boolean)
  )
  return opts.data.enrichedHoldings
    .filter((h) => h.asset_type !== 'cash' && want.has(h.symbol.toUpperCase()))
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, HOLDING_NEWS_MAX_HOLDINGS)
    .map((h) => ({
      symbol: h.symbol.toUpperCase(),
      assetType: h.asset_type,
      name: resolveAssetName(h.symbol, h.asset_type),
    }))
}

export function resolveNewsHoldings(
  data: PortfolioData,
  symbols?: string[]
): NewsTarget[] {
  return resolveNewsTargets({ data, symbols, universe: 'holdings' })
}
