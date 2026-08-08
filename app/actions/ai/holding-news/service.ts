/**
 * Shared Holding News pipeline (not a Server Action).
 *
 * Used by:
 *  - generateHoldingNews (sidebar UI)
 *  - News Agent (orchestrator invoke_news_agent)
 *
 * Flow: cache/cooldown → Finnhub (equity) + xAI search (crypto) → impact → persist.
 */

import { isCurrentUserAdmin } from '@/lib/user'
import { getPortfolioData, type PortfolioData } from '@/lib/portfolioData'
import {
  updateLastAICallTime,
  getLatestAIInsight,
} from '@/app/actions/ai/storage'
import type { HoldingNewsImpactEntry } from '@/lib/schemas'
import { callXaiResponsesWithSearch } from './xaiLiveSearch'
import { analyzeNewsImpact } from './analyzeImpact'
import { saveHoldingNewsPackage } from './persist'
import { fetchFinnhubCompanyNewsBullets } from './finnhubCompanyNews'
import {
  buildHoldingNewsSystemPrompt,
  buildHoldingNewsUserPrompt,
} from './prompts'
import {
  HOLDING_NEWS_COOLDOWN_MS,
  HOLDING_NEWS_EXTENDED_LOOKBACK_DAYS,
  HOLDING_NEWS_FEATURE_TYPE,
  type CachedInsight,
  type HoldingNewsSuccessResult,
  computeNewsWindow,
  computeNewsWindowDays,
  resolveNewsHoldings,
  parseHoldingNewsJson,
  normalizeHoldingNews,
  newsHasAnyBullets,
  symbolHasBullets,
  mergeHoldingNews,
  buildHoldingNewsMergeMessage,
  parseHoldingNewsStored,
  toCooldownResult,
  buildNextRefreshAt,
  hasUncoveredHoldings,
  symbolsEligibleForExtendedLookback,
} from './newsUtils'

export { resolveNewsHoldings } from './newsUtils'

export type HoldingNewsResult =
  | HoldingNewsSuccessResult
  | { error: string; news?: undefined; impact?: undefined }

export type RunHoldingNewsOptions = {
  userId: string
  /**
   * UI sidebar: true = try live when cooldown allows (shows cooldown copy if blocked).
   * News agent: prefer mode 'auto' instead.
   */
  forceRefresh?: boolean
  /**
   * - auto (default for agent): silent content if fresh; live fetch if empty/stale; updates cache on live
   * - ui: sidebar refresh semantics with user-facing cooldown messages
   */
  mode?: 'auto' | 'ui'
  /**
   * Limit to these symbols (uppercased). Must be open portfolio positions.
   * When omitted, uses top holdings by market value.
   */
  symbols?: string[]
  /** Skip 24h cooldown (admin or internal agent with bypass). */
  skipCooldown?: boolean
}

export type RunHoldingNewsOutcome = HoldingNewsResult & {
  fromCache?: boolean
  updatedCache?: boolean
}

type NewsHolding = { symbol: string; assetType: string; name: string }

function isEquityAssetType(assetType: string): boolean {
  return assetType === 'stock' || assetType === 'etf'
}

/**
 * Full holding-news pipeline for an authenticated userId.
 * Does not re-check auth (caller must).
 */
export async function runHoldingNews(
  options: RunHoldingNewsOptions
): Promise<RunHoldingNewsOutcome> {
  const {
    userId,
    forceRefresh = false,
    mode = forceRefresh ? 'ui' : 'auto',
    symbols,
  } = options
  const isUi = mode === 'ui'

  const data = await getPortfolioData()
  if (data.error || data.totalMarketValue === 0) {
    return { error: 'No portfolio data available to analyze.' }
  }

  const holdingsPreview = resolveNewsHoldings(data, symbols)
  if (holdingsPreview.length === 0) {
    return {
      error: symbols?.length
        ? 'None of the requested symbols are open non-cash holdings.'
        : 'No non-cash holdings to fetch news for.',
    }
  }

  const hasCrypto = holdingsPreview.some((h) => h.assetType === 'crypto')
  const hasEquity = holdingsPreview.some((h) => isEquityAssetType(h.assetType))

  if (hasCrypto && !process.env.XAI_API_KEY) {
    return { error: 'AI service is not configured.' }
  }
  if (hasEquity && !process.env.FINNHUB_API_KEY) {
    return {
      error:
        'Stock/ETF news requires FINNHUB_API_KEY. Crypto-only portfolios can use XAI_API_KEY alone.',
    }
  }
  if (!process.env.XAI_API_KEY && !process.env.FINNHUB_API_KEY) {
    return { error: 'News services are not configured.' }
  }

  try {
    const cached = await getLatestAIInsight(userId, HOLDING_NEWS_FEATURE_TYPE)
    const stored = cached
      ? parseHoldingNewsStored(cached.result, cached.createdAt)
      : null

    const admin = options.skipCooldown || (await isCurrentUserAdmin())

    const requestHasBullets = (news: Record<string, string[]> | null | undefined) =>
      holdingsPreview.some((h) => symbolHasBullets(news?.[h.symbol]))

    const lastCheckMs =
      stored && cached
        ? Date.parse(stored.lastCheckedAt ?? cached.createdAt)
        : NaN
    const elapsed =
      !Number.isNaN(lastCheckMs) ? Date.now() - lastCheckMs : Number.POSITIVE_INFINITY
    const withinCooldown =
      !admin &&
      stored &&
      newsHasAnyBullets(stored.news) &&
      typeof stored.windowFrom === 'string' &&
      elapsed < HOLDING_NEWS_COOLDOWN_MS

    // Cooldown: cannot live-fetch for non-admins — return stored content (silent for agent)
    if (withinCooldown && stored) {
      const filtered = filterPackageToHoldings(stored, holdingsPreview)
      if (isUi) {
        const nextRefreshAt = buildNextRefreshAt(lastCheckMs)
        const hoursLeft = Math.max(
          1,
          Math.ceil((HOLDING_NEWS_COOLDOWN_MS - elapsed) / (60 * 60 * 1000))
        )
        return {
          ...toCooldownResult(stored, {
            nextRefreshAt,
            message: `Showing latest saved news. Next refresh available in ~${hoursLeft}h.`,
          }),
          fromCache: true,
          updatedCache: false,
        }
      }
      // Agent: content only, no cache jargon
      return {
        ...filtered,
        message: undefined,
        fromCache: true,
        updatedCache: false,
      }
    }

    // Auto: reuse fresh stored content without talking about cache
    const storedFresh =
      stored &&
      requestHasBullets(stored.news) &&
      !Number.isNaN(lastCheckMs) &&
      elapsed < HOLDING_NEWS_COOLDOWN_MS

    if (!isUi && !forceRefresh && storedFresh && stored) {
      return {
        ...filterPackageToHoldings(stored, holdingsPreview),
        message: undefined,
        fromCache: true,
        updatedCache: false,
      }
    }

    // Live fetch (updates package) when UI refresh, empty request, or stale
    const windowBase: CachedInsight | null =
      cached && stored && typeof stored.windowFrom === 'string' ? cached : null

    const live = await runLiveHoldingNewsFetch(
      userId,
      holdingsPreview,
      windowBase,
      cached,
      stored
    )
    if ('error' in live && live.error) {
      return { ...live, fromCache: false, updatedCache: false }
    }
    // Strip internal-ish merge messages for agent path
    if (!isUi && live && !('error' in live && live.error)) {
      const { message: _m, ...rest } = live as HoldingNewsSuccessResult & {
        message?: string
      }
      return { ...rest, fromCache: false, updatedCache: true }
    }
    return { ...live, fromCache: false, updatedCache: true }
  } catch (e) {
    console.error('Holding news error', e)
    const msg = e instanceof Error ? e.message : ''
    if (
      msg.includes('xAI request failed') ||
      msg.includes('Live news') ||
      msg.includes('Empty response')
    ) {
      return {
        error:
          'Live news search is temporarily unavailable (xAI). Please try again in a minute.',
      }
    }
    return { error: 'Failed to fetch holding news. Please try again later.' }
  }
}

/** Narrow a full stored package to the holdings in this request. */
function filterPackageToHoldings(
  stored: NonNullable<ReturnType<typeof parseHoldingNewsStored>>,
  holdings: NewsHolding[]
): HoldingNewsSuccessResult {
  const news: Record<string, string[]> = {}
  const impact: Record<string, HoldingNewsImpactEntry> = {}
  for (const h of holdings) {
    news[h.symbol] = stored.news[h.symbol] ?? []
    if (stored.impact?.[h.symbol]) {
      impact[h.symbol] = stored.impact[h.symbol]
    }
  }
  return {
    news,
    impact: Object.keys(impact).length > 0 ? impact : undefined,
    contentFetchedAt: stored.contentFetchedAt,
    lastCheckedAt: stored.lastCheckedAt,
    cachedAt: stored.contentFetchedAt ?? stored.lastCheckedAt,
    windowFrom: stored.windowFrom,
    windowTo: stored.windowTo,
    nextRefreshAt: stored.lastCheckedAt
      ? buildNextRefreshAt(Date.parse(stored.lastCheckedAt))
      : undefined,
  }
}

/**
 * Live pipeline: Finnhub (equity) + xAI (crypto) → optional 14d first-time empty → impact → persist.
 */
async function runLiveHoldingNewsFetch(
  userId: string,
  holdings: NewsHolding[],
  windowBase: CachedInsight | null,
  previousRow: CachedInsight | null,
  previousStored: ReturnType<typeof parseHoldingNewsStored>
): Promise<HoldingNewsResult> {
  if (holdings.length === 0) {
    return { error: 'No non-cash holdings to fetch news for.' }
  }

  const symbols = holdings.map((h) => h.symbol)
  const previousNews = previousStored?.news ?? null

  const needsBaseline = hasUncoveredHoldings(symbols, previousNews)
  const lookbackFrom =
    !needsBaseline && windowBase && previousStored
      ? new Date(previousStored.lastCheckedAt ?? windowBase.createdAt)
      : null
  const pass1Window = computeNewsWindow(lookbackFrom)

  const incoming1 = await fetchNewsForHoldings(holdings, pass1Window)
  let merge = mergeHoldingNews(previousNews, incoming1, symbols)

  const extendedSymbols = symbolsEligibleForExtendedLookback(
    symbols,
    previousNews,
    merge.news
  )

  let windowFrom = pass1Window.fromDate
  let windowTo = pass1Window.toDate

  if (extendedSymbols.length > 0) {
    const extendedHoldings = holdings.filter((h) =>
      extendedSymbols.includes(h.symbol)
    )
    const pass2Window = computeNewsWindowDays(
      HOLDING_NEWS_EXTENDED_LOOKBACK_DAYS
    )
    const incoming2 = await fetchNewsForHoldings(extendedHoldings, pass2Window)
    merge = mergeHoldingNews(merge.news, incoming2, symbols)
    windowFrom = pass2Window.fromDate
    windowTo = pass2Window.toDate
  }

  const nowIso = new Date().toISOString()
  const nextRefreshAt = buildNextRefreshAt()
  const previousImpact = previousStored?.impact ?? {}
  const previousContentFetchedAt =
    previousStored?.contentFetchedAt ?? previousRow?.createdAt ?? nowIso

  const impact: Record<string, HoldingNewsImpactEntry> = {}
  for (const symbol of symbols) {
    if (
      !merge.changedSymbols.includes(symbol) &&
      previousImpact[symbol] &&
      symbolHasBullets(merge.news[symbol])
    ) {
      impact[symbol] = previousImpact[symbol]
    }
  }

  const needImpact = symbols.filter(
    (s) =>
      symbolHasBullets(merge.news[s]) &&
      (merge.changedSymbols.includes(s) || !previousImpact[s])
  )

  if (needImpact.length > 0 && process.env.XAI_API_KEY) {
    const impactHoldings = holdings.filter((h) => needImpact.includes(h.symbol))
    const newsForImpact: Record<string, string[]> = {}
    for (const s of needImpact) {
      newsForImpact[s] = merge.news[s] ?? []
    }
    const freshImpact = await analyzeNewsImpact(newsForImpact, impactHoldings)
    Object.assign(impact, freshImpact)
  }

  const contentFetchedAt =
    merge.changedSymbols.length > 0 ? nowIso : previousContentFetchedAt
  let message = buildHoldingNewsMergeMessage(merge)
  if (extendedSymbols.length > 0) {
    const extra =
      extendedSymbols.length === 1
        ? `Expanded search to ${HOLDING_NEWS_EXTENDED_LOOKBACK_DAYS}d for a new holding.`
        : `Expanded search to ${HOLDING_NEWS_EXTENDED_LOOKBACK_DAYS}d for ${extendedSymbols.length} new holdings.`
    message = message ? `${message} ${extra}` : extra
  }

  // Merge into full previous package when fetching a symbol subset so we don't wipe others
  const fullNews = { ...(previousNews ?? {}), ...merge.news }
  const fullImpact = { ...previousImpact, ...impact }

  await saveHoldingNewsPackage(userId, {
    news: fullNews,
    impact: fullImpact,
    windowFrom,
    windowTo,
    contentFetchedAt,
    lastCheckedAt: nowIso,
  })
  await updateLastAICallTime(userId)

  // Return only requested holdings' slice
  const outNews: Record<string, string[]> = {}
  const outImpact: Record<string, HoldingNewsImpactEntry> = {}
  for (const s of symbols) {
    outNews[s] = fullNews[s] ?? []
    if (fullImpact[s]) outImpact[s] = fullImpact[s]
  }

  return {
    news: outNews,
    impact: Object.keys(outImpact).length > 0 ? outImpact : undefined,
    contentFetchedAt,
    lastCheckedAt: nowIso,
    cachedAt: contentFetchedAt,
    windowFrom,
    windowTo,
    nextRefreshAt,
    message,
  }
}

async function fetchNewsForHoldings(
  holdings: NewsHolding[],
  window: { fromDate: string; toDate: string; lookbackDays: number }
): Promise<Record<string, string[]>> {
  const equities = holdings.filter((h) => isEquityAssetType(h.assetType))
  const cryptos = holdings.filter((h) => h.assetType === 'crypto')
  const out: Record<string, string[]> = {}

  if (equities.length > 0) {
    await Promise.all(
      equities.map(async (h) => {
        out[h.symbol] = await fetchFinnhubCompanyNewsBullets(
          h.symbol,
          window.fromDate,
          window.toDate,
          h.name
        )
      })
    )
  }

  if (cryptos.length > 0) {
    if (!process.env.XAI_API_KEY) {
      for (const h of cryptos) out[h.symbol] = []
    } else {
      const cryptoNews = await liveSearchCryptoNews(cryptos, window)
      Object.assign(out, cryptoNews)
    }
  }

  for (const h of holdings) {
    if (!Object.prototype.hasOwnProperty.call(out, h.symbol)) {
      out[h.symbol] = []
    }
  }

  return out
}

async function liveSearchCryptoNews(
  holdings: NewsHolding[],
  window: { fromDate: string; toDate: string; lookbackDays: number }
): Promise<Record<string, string[]>> {
  const symbols = holdings.map((h) => h.symbol)
  const holdingsSummary = holdings
    .map((h) => `- ${h.symbol} (${h.assetType}) — ${h.name}`)
    .join('\n')

  const rawText = await callXaiResponsesWithSearch({
    system: buildHoldingNewsSystemPrompt(),
    prompt: buildHoldingNewsUserPrompt({
      fromDate: window.fromDate,
      toDate: window.toDate,
      lookbackDays: window.lookbackDays,
      holdingsSummary,
    }),
    fromDate: window.fromDate,
    toDate: window.toDate,
  })

  const parsed = parseHoldingNewsJson(rawText)
  return normalizeHoldingNews(parsed, symbols, holdings)
}
