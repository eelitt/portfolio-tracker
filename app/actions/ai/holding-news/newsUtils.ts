/**
 * Pure helpers for the Holding News feature.
 *
 * Used by generateHoldingNews.ts (no 'use server' here — these are not actions).
 *
 * Responsibilities:
 * 1. Feature constants (cooldown, lookback, holdings cap, feature_type key)
 * 2. Date window for live search / prompts (first fetch = 7d, later = elapsed ≤ 7d)
 * 3. Which holdings to cover (top non-cash by market value + human-readable names)
 * 4. Parse & normalize model output into Record<SYMBOL, string[]> for DB/UI
 * 5. Compare news packages (empty check + content fingerprint) for “nothing new” UX
 * 6. Parse stored user_ai_insights jsonb into a typed package
 */

import {
  holdingNewsSchema,
  holdingNewsImpactEntrySchema,
  holdingNewsStoredSchema,
  type HoldingNewsImpactEntry,
  type HoldingNewsStored,
} from '@/lib/schemas'
import type { PortfolioData } from '@/lib/portfolioData'
import { STOCK_SYMBOLS, ETF_SYMBOLS, CRYPTO_SYMBOLS } from '@/lib/symbols'

/** Minimum gap between live news fetches per user (same row is reused as cache). */
export const HOLDING_NEWS_COOLDOWN_MS = 24 * 60 * 60 * 1000

/** Cap on how far back we search / ask the model to cover (first fetch and max re-fetch). */
export const HOLDING_NEWS_MAX_LOOKBACK_DAYS = 7

/**
 * One-shot extended lookback for first-time holdings that return empty after the 7d pass.
 * Does not apply to symbols that already had news or were covered as empty.
 */
export const HOLDING_NEWS_EXTENDED_LOOKBACK_DAYS = 14

/**
 * Only the largest positions get news (cost control).
 * Smaller holdings are omitted from the LLM prompt and result keys.
 */
export const HOLDING_NEWS_MAX_HOLDINGS = 6

/** user_ai_insights.feature_type value for this feature (one row per user). */
export const HOLDING_NEWS_FEATURE_TYPE = 'holding_news'

/** Shape returned by getLatestAIInsight for holding_news (and similar). */
export type CachedInsight = { result: Record<string, unknown>; createdAt: string }

/**
 * Success payload returned to the client (cooldown, no-op keep, or fresh update).
 * Kept here so parse/build helpers stay free of the server-action module.
 */
export type HoldingNewsSuccessResult = {
  news: Record<string, string[]>
  impact?: Record<string, HoldingNewsImpactEntry>
  contentFetchedAt?: string
  lastCheckedAt?: string
  cachedAt?: string
  message?: string
  nextRefreshAt?: string
  windowFrom?: string
  windowTo?: string
  error?: undefined
}

/** ISO timestamp for next allowed live fetch (fromMs + cooldown). */
export function buildNextRefreshAt(fromMs: number = Date.now()): string {
  return new Date(fromMs + HOLDING_NEWS_COOLDOWN_MS).toISOString()
}

/**
 * Soft-parse impact map: each entry validated with Zod; invalid keys dropped.
 */
function parseImpactMap(raw: unknown): Record<string, HoldingNewsImpactEntry> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, HoldingNewsImpactEntry> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = holdingNewsImpactEntrySchema.safeParse(value)
    if (parsed.success) {
      out[key.toUpperCase().trim() || key] = parsed.data
    }
  }
  return out
}

/**
 * Parse user_ai_insights.result for holding_news into a typed package.
 * Returns null if news is missing/unusable. Soft-filters bad impact entries.
 * Fills contentFetchedAt / lastCheckedAt from legacy fetchedAt or rowCreatedAt.
 */
export function parseHoldingNewsStored(
  raw: unknown,
  rowCreatedAt: string
): HoldingNewsStored | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const obj = raw as Record<string, unknown>
  // Soft impact: strip before strict-ish parse so one bad entry doesn't kill the package
  const impact = parseImpactMap(obj.impact)

  const candidate = {
    ...obj,
    impact,
  }

  const result = holdingNewsStoredSchema.safeParse(candidate)
  if (!result.success) {
    // Fallback: require only a coercible news map
    const newsOnly = holdingNewsSchema.safeParse({ news: obj.news })
    if (!newsOnly.success) return null
    return {
      news: newsOnly.data.news,
      impact,
      windowFrom: typeof obj.windowFrom === 'string' ? obj.windowFrom : undefined,
      windowTo: typeof obj.windowTo === 'string' ? obj.windowTo : undefined,
      contentFetchedAt:
        typeof obj.contentFetchedAt === 'string'
          ? obj.contentFetchedAt
          : typeof obj.fetchedAt === 'string'
            ? obj.fetchedAt
            : rowCreatedAt,
      lastCheckedAt:
        typeof obj.lastCheckedAt === 'string' ? obj.lastCheckedAt : rowCreatedAt,
      fetchedAt: typeof obj.fetchedAt === 'string' ? obj.fetchedAt : undefined,
    }
  }

  const stored = result.data
  const contentFetchedAt =
    stored.contentFetchedAt ?? stored.fetchedAt ?? rowCreatedAt
  const lastCheckedAt = stored.lastCheckedAt ?? rowCreatedAt

  return {
    ...stored,
    impact: stored.impact ?? impact,
    contentFetchedAt,
    lastCheckedAt,
  }
}

/**
 * Map a stored package + cooldown message into the client success shape.
 */
export function toCooldownResult(
  stored: HoldingNewsStored,
  opts: { message: string; nextRefreshAt: string }
): HoldingNewsSuccessResult {
  const contentFetchedAt = stored.contentFetchedAt!
  const lastCheckedAt = stored.lastCheckedAt!
  const impact = stored.impact && Object.keys(stored.impact).length > 0
    ? stored.impact
    : undefined

  return {
    news: stored.news,
    impact,
    contentFetchedAt,
    lastCheckedAt,
    cachedAt: contentFetchedAt,
    windowFrom: stored.windowFrom,
    windowTo: stored.windowTo,
    nextRefreshAt: opts.nextRefreshAt,
    message: opts.message,
  }
}

/** True if a single bullet list has at least one non-empty string. */
export function symbolHasBullets(bullets: string[] | null | undefined): boolean {
  return Array.isArray(bullets) && bullets.some(b => String(b).trim().length > 0)
}

/** True if any symbol has at least one non-empty bullet. */
export function newsHasAnyBullets(news: Record<string, string[]> | null | undefined): boolean {
  if (!news) return false
  return Object.values(news).some(symbolHasBullets)
}

/**
 * True if this ticker was never written into the stored package (missing key).
 * Covered-as-empty (`[]`) is NOT uncovered — user already got a first-time search.
 */
export function isUncoveredSymbol(
  symbol: string,
  previousNews: Record<string, string[]> | null | undefined
): boolean {
  if (!previousNews) return true
  const upper = symbol.toUpperCase()
  if (Object.prototype.hasOwnProperty.call(previousNews, symbol)) return false
  if (Object.prototype.hasOwnProperty.call(previousNews, upper)) return false
  // Case-insensitive key scan
  for (const key of Object.keys(previousNews)) {
    if (key.toUpperCase() === upper) return false
  }
  return true
}

/** True if any selected symbol has no entry in the stored news map yet. */
export function hasUncoveredHoldings(
  selectedSymbols: string[],
  previousNews: Record<string, string[]> | null | undefined
): boolean {
  return selectedSymbols.some(s => isUncoveredSymbol(s, previousNews))
}

/**
 * First-time symbols that are still empty after a live pass → eligible for 14d retry.
 * Never includes symbols that already existed in previousNews (even as []).
 */
export function symbolsEligibleForExtendedLookback(
  selectedSymbols: string[],
  previousNews: Record<string, string[]> | null | undefined,
  afterPassNews: Record<string, string[]>
): string[] {
  return selectedSymbols.filter(
    s =>
      isUncoveredSymbol(s, previousNews) && !symbolHasBullets(afterPassNews[s])
  )
}

/**
 * Stable fingerprint of one symbol's bullets (order-independent, case-insensitive).
 */
export function symbolNewsFingerprint(bullets: string[] | null | undefined): string {
  if (!Array.isArray(bullets)) return ''
  return bullets
    .map(b => String(b).trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|')
}

/**
 * Stable fingerprint of news content for “nothing new” detection.
 * Order-independent per symbol and across symbols; case-insensitive bullets.
 */
export function newsContentFingerprint(news: Record<string, string[]>): string {
  const symbols = Object.keys(news).map(s => s.toUpperCase()).sort()
  const parts: string[] = []
  for (const symbol of symbols) {
    const bullets = news[symbol] ?? news[symbol.toLowerCase()] ?? []
    const fp = symbolNewsFingerprint(bullets)
    if (!fp) continue
    parts.push(`${symbol}:${fp}`)
  }
  return parts.join('||')
}

export type HoldingNewsMergeResult = {
  /** News map restricted to current symbols only. */
  news: Record<string, string[]>
  /** Symbols that first-filled or got a material update (need impact recompute). */
  changedSymbols: string[]
  firstFillCount: number
  updateCount: number
  keptCount: number
  emptyCount: number
}

/**
 * Per-symbol merge: first fill vs material update.
 * Scales to any N — never uses package-level empty/same.
 *
 * - No previous bullets + new bullets → first fill
 * - Previous bullets + empty/same new → keep previous
 * - Previous bullets + different new → update
 */
export function mergeHoldingNews(
  previous: Record<string, string[]> | null | undefined,
  incoming: Record<string, string[]>,
  symbols: string[]
): HoldingNewsMergeResult {
  const prev = previous ?? {}
  const news: Record<string, string[]> = {}
  const changedSymbols: string[] = []
  let firstFillCount = 0
  let updateCount = 0
  let keptCount = 0
  let emptyCount = 0

  for (const symbol of symbols) {
    const prevBullets = prev[symbol] ?? prev[symbol.toUpperCase()] ?? []
    const nextBullets = incoming[symbol] ?? []
    const hadPrev = symbolHasBullets(prevBullets)
    const hasNext = symbolHasBullets(nextBullets)

    if (!hadPrev) {
      if (hasNext) {
        news[symbol] = nextBullets
        changedSymbols.push(symbol)
        firstFillCount++
      } else {
        news[symbol] = []
        emptyCount++
      }
      continue
    }

    // Had previous content
    if (
      !hasNext ||
      symbolNewsFingerprint(prevBullets) === symbolNewsFingerprint(nextBullets)
    ) {
      news[symbol] = prevBullets
      keptCount++
    } else {
      news[symbol] = nextBullets
      changedSymbols.push(symbol)
      updateCount++
    }
  }

  return {
    news,
    changedSymbols,
    firstFillCount,
    updateCount,
    keptCount,
    emptyCount,
  }
}

/** User-facing summary after a live merge. */
export function buildHoldingNewsMergeMessage(merge: HoldingNewsMergeResult): string | undefined {
  const { firstFillCount, updateCount, keptCount, emptyCount, changedSymbols } = merge
  if (changedSymbols.length === 0) {
    if (keptCount > 0) {
      return 'No material new headlines for holdings that already had news. Showing previous news where available.'
    }
    if (emptyCount > 0) {
      return 'No material news found in this period for your holdings.'
    }
    return undefined
  }
  const parts: string[] = []
  if (firstFillCount > 0) {
    parts.push(
      firstFillCount === 1
        ? 'Added news for a new holding'
        : `Added news for ${firstFillCount} holdings`
    )
  }
  if (updateCount > 0) {
    parts.push(
      updateCount === 1
        ? 'updated one holding'
        : `updated ${updateCount} holdings`
    )
  }
  if (keptCount > 0) {
    parts.push('others unchanged')
  }
  if (parts.length === 0) return undefined
  const text = parts.join('; ')
  return text.charAt(0).toUpperCase() + text.slice(1) + '.'
}

/**
 * Builds an inclusive calendar date range for news coverage.
 *
 * - First ever fetch / uncovered holdings (no lastFetchedAt): last HOLDING_NEWS_MAX_LOOKBACK_DAYS days.
 * - Later fetches: days since last fetch, clamped to [1, HOLDING_NEWS_MAX_LOOKBACK_DAYS].
 *   (The 24h fetch cooldown means elapsed is almost always ≥ 1 day when re-fetch is allowed.)
 *
 * Dates are UTC YYYY-MM-DD for prompts and x_search-style ranges.
 */
export function computeNewsWindow(lastFetchedAt: Date | null): {
  fromDate: string
  toDate: string
  lookbackDays: number
} {
  let lookbackDays = HOLDING_NEWS_MAX_LOOKBACK_DAYS
  if (lastFetchedAt) {
    const elapsedMs = Date.now() - lastFetchedAt.getTime()
    const elapsedDays = Math.max(1, Math.ceil(elapsedMs / (24 * 60 * 60 * 1000)))
    lookbackDays = Math.min(HOLDING_NEWS_MAX_LOOKBACK_DAYS, elapsedDays)
  }
  return computeNewsWindowDays(lookbackDays)
}

/** Fixed lookback window ending today (UTC), e.g. 7 or 14 days. */
export function computeNewsWindowDays(lookbackDays: number): {
  fromDate: string
  toDate: string
  lookbackDays: number
} {
  const days = Math.max(1, Math.floor(lookbackDays))
  const to = new Date()
  const toDate = toISODate(to)
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - days)
  return { fromDate: toISODate(from), toDate, lookbackDays: days }
}

function normalizeAssetName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\b(inc\.?|corp\.?|ltd\.?|llc|co\.?|company|the)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Map free-form model keys (company/project names) to tickers for the requested set.
 * Catalog-driven; not symbol-specific hardcoding.
 */
export function resolveNewsKeyToSymbol(
  rawKey: string,
  holdings: Array<{ symbol: string; name: string }>
): string | null {
  const upper = rawKey.toUpperCase().trim()
  if (!upper) return null
  if (holdings.some(h => h.symbol === upper)) return upper

  const keyNorm = normalizeAssetName(rawKey)
  if (!keyNorm || keyNorm.length < 3) return null

  for (const h of holdings) {
    const nameNorm = normalizeAssetName(h.name)
    if (!nameNorm) continue
    if (nameNorm === keyNorm) return h.symbol
    // "apple" → "apple inc"
    if (nameNorm.startsWith(keyNorm) || keyNorm.startsWith(nameNorm)) {
      return h.symbol
    }
  }
  return null
}

/** UTC calendar date as YYYY-MM-DD (matches xAI tool date filters). */
function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Maps ticker + asset_type → display name from curated symbol catalogs.
 * Helps the model search "Chainlink" not only "LINK". Falls back to the ticker.
 */
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

/**
 * Holdings included in a news (and impact) run.
 * Cash is excluded; rest sorted by market value desc; take top HOLDING_NEWS_MAX_HOLDINGS.
 * Symbols are uppercased so they match transaction/holdings keys and tooltips.
 */
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

/**
 * Best-effort conversion of an arbitrary object into symbol → bullet list.
 * Trims strings, drops empties, caps at 3 bullets per key (schema max).
 * Returns null if `value` is not a plain object.
 */
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

/**
 * Parses free-form model text into a news map.
 *
 * Live-search responses are not always clean generateObject JSON: models may wrap
 * markdown fences or return either { news: {...} } or a flat { SYMBOL: [...] }.
 * We strip fences, extract the first {...} slice, JSON.parse, then coerce.
 * Prefer Zod-valid output when possible; still return coerced maps if schema is loose.
 * On total failure returns {} (caller still normalizes against the holdings list).
 */
export function parseHoldingNewsJson(raw: string): Record<string, string[]> {
  // Strip optional ```json ... ``` wrappers the model sometimes adds
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  // Prefer the outermost JSON object if there is leading/trailing prose
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

    // Preferred shape: { "news": { "LINK": ["..."], ... } }
    if (obj.news) {
      const fromNews = coerceNewsRecord(obj.news)
      if (fromNews) {
        const result = holdingNewsSchema.safeParse({ news: fromNews })
        if (result.success) return result.data.news
        return fromNews
      }
    }

    // Fallback: flat map of symbol → bullets (no "news" wrapper)
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
 * Aligns a parsed news map with the holdings we actually requested.
 *
 * - Uppercase keys (tooltips use holding.symbol as-is)
 * - Map company/project names → tickers when holdings metadata is provided
 * - Drop unknown symbols; ensure every requested symbol has a key (default [])
 * - Cap 3 bullets per symbol
 *
 * Guarantees the UI always sees one card/section per requested holding.
 */
export function normalizeHoldingNews(
  raw: Record<string, string[]>,
  symbols: string[],
  holdings?: Array<{ symbol: string; name: string }>
): Record<string, string[]> {
  const byUpper = new Map<string, string[]>()
  for (const [key, bullets] of Object.entries(raw)) {
    const cleaned = (Array.isArray(bullets) ? bullets : [])
      .map(b => String(b).trim())
      .filter(Boolean)
      .slice(0, 3)

    let symbol = key.toUpperCase().trim()
    if (holdings && holdings.length > 0) {
      const resolved = resolveNewsKeyToSymbol(key, holdings)
      if (resolved) symbol = resolved
    }
    if (!symbol) continue

    // Prefer non-empty if the same symbol appears under ticker + name keys
    const existing = byUpper.get(symbol)
    if (!existing || (existing.length === 0 && cleaned.length > 0)) {
      byUpper.set(symbol, cleaned)
    }
  }

  const out: Record<string, string[]> = {}
  for (const symbol of symbols) {
    out[symbol] = byUpper.get(symbol) ?? []
  }
  return out
}
