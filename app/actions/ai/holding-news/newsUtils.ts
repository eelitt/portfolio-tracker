import { holdingNewsSchema } from '@/lib/schemas'
import type { PortfolioData } from '@/lib/portfolioData'
import { STOCK_SYMBOLS, ETF_SYMBOLS, CRYPTO_SYMBOLS } from '@/lib/symbols'

export const HOLDING_NEWS_COOLDOWN_MS = 24 * 60 * 60 * 1000
export const HOLDING_NEWS_MAX_LOOKBACK_DAYS = 7
export const HOLDING_NEWS_MAX_HOLDINGS = 6
export const HOLDING_NEWS_FEATURE_TYPE = 'holding_news'

export type CachedInsight = { result: Record<string, unknown>; createdAt: string }

export function computeNewsWindow(lastFetchedAt: Date | null): {
  fromDate: string
  toDate: string
  lookbackDays: number
} {
  const to = new Date()
  const toDate = toISODate(to)

  let lookbackDays = HOLDING_NEWS_MAX_LOOKBACK_DAYS
  if (lastFetchedAt) {
    const elapsedMs = Date.now() - lastFetchedAt.getTime()
    const elapsedDays = Math.max(1, Math.ceil(elapsedMs / (24 * 60 * 60 * 1000)))
    lookbackDays = Math.min(HOLDING_NEWS_MAX_LOOKBACK_DAYS, elapsedDays)
  }

  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - lookbackDays)
  return { fromDate: toISODate(from), toDate, lookbackDays }
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function resolveAssetName(symbol: string, assetType: string): string {
  const upper = symbol.toUpperCase()
  if (assetType === 'crypto') {
    const found = CRYPTO_SYMBOLS.find(c => c.symbol.toUpperCase() === upper)
    return found?.name ?? upper
  }
  if (assetType === 'etf') {
    const found = ETF_SYMBOLS.find(s => s.symbol.toUpperCase() === upper)
    return found?.name ?? upper
  }
  const found = STOCK_SYMBOLS.find(s => s.symbol.toUpperCase() === upper)
  return found?.name ?? upper
}

export function selectHoldingsForNews(
  data: PortfolioData
): Array<{ symbol: string; assetType: string; name: string }> {
  const nonCash = data.enrichedHoldings.filter(h => h.asset_type !== 'cash')
  const sorted = [...nonCash].sort((a, b) => b.marketValue - a.marketValue)
  return sorted.slice(0, HOLDING_NEWS_MAX_HOLDINGS).map(h => ({
    symbol: h.symbol.toUpperCase(),
    assetType: h.asset_type,
    name: resolveAssetName(h.symbol, h.asset_type),
  }))
}

function coerceNewsRecord(value: unknown): Record<string, string[]> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const out: Record<string, string[]> = {}
  for (const [key, bullets] of Object.entries(value as Record<string, unknown>)) {
    if (!key.trim()) continue
    if (!Array.isArray(bullets)) {
      out[key] = []
      continue
    }
    out[key] = bullets
      .map(b => String(b).trim())
      .filter(Boolean)
      .slice(0, 3)
  }
  return out
}

export function parseHoldingNewsJson(raw: string): Record<string, string[]> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  const jsonSlice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonSlice)
  } catch {
    console.error('Failed to parse holding news JSON', cleaned.slice(0, 500))
    return {}
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>
    if (obj.news) {
      const fromNews = coerceNewsRecord(obj.news)
      if (fromNews) {
        const result = holdingNewsSchema.safeParse({ news: fromNews })
        if (result.success) return result.data.news
        return fromNews
      }
    }
    const flat = coerceNewsRecord(obj)
    if (flat && Object.values(flat).some(arr => arr.length > 0)) {
      const result = holdingNewsSchema.safeParse({ news: flat })
      if (result.success) return result.data.news
      return flat
    }
  }

  console.error('Holding news schema validation failed for payload', String(raw).slice(0, 300))
  return {}
}

/**
 * Force uppercase keys, keep only requested symbols, max 3 bullets each,
 * and ensure every requested holding has an entry (empty array if none).
 */
export function normalizeHoldingNews(
  raw: Record<string, string[]>,
  symbols: string[]
): Record<string, string[]> {
  const byUpper = new Map<string, string[]>()
  for (const [key, bullets] of Object.entries(raw)) {
    const upper = key.toUpperCase().trim()
    if (!upper) continue
    const cleaned = (Array.isArray(bullets) ? bullets : [])
      .map(b => String(b).trim())
      .filter(Boolean)
      .slice(0, 3)
    byUpper.set(upper, cleaned)
  }

  const out: Record<string, string[]> = {}
  for (const symbol of symbols) {
    out[symbol] = byUpper.get(symbol) ?? []
  }
  return out
}
