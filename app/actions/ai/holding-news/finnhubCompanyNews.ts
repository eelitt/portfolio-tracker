/**
 * Finnhub company-news for stock/ETF holding news (date-ranged, free tier).
 * Not a server action — used only by generateHoldingNews.
 *
 * Finnhub often returns loosely "related" articles (related=AAPL) whose headlines
 * are about other companies. We filter by ticker/name in headline+summary.
 */

const FINNHUB_COMPANY_NEWS = 'https://finnhub.io/api/v1/company-news'

export type FinnhubCompanyArticle = {
  headline?: string
  summary?: string
  source?: string
  datetime?: number
  url?: string
  related?: string
  category?: string
}

/** Strip legal suffixes for name matching (Apple Inc. → apple). */
export function normalizeCompanyNameForMatch(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\b(inc\.?|corp\.?|ltd\.?|llc|co\.?|company|the|plc|holdings?|group)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * True if headline/summary mentions this ticker or company name.
 * Pure helper — Finnhub "related" alone is too loose.
 */
export function isArticleRelevantToHolding(
  article: FinnhubCompanyArticle,
  symbol: string,
  companyName?: string
): boolean {
  const text = `${article.headline ?? ''} ${article.summary ?? ''}`.toLowerCase()
  if (!text.trim()) return false

  const sym = symbol.toUpperCase().trim()
  if (!sym) return false

  // Ticker: whole token, $TICKER, (TICKER)
  const tickerRe = new RegExp(
    `(^|[^a-z0-9])(\\$${sym}|\\(${sym}\\)|${sym})([^a-z0-9]|$)`,
    'i'
  )
  if (tickerRe.test(text)) return true

  if (companyName) {
    const nameNorm = normalizeCompanyNameForMatch(companyName)
    if (nameNorm.length >= 3 && text.includes(nameNorm)) return true

    // Multi-word names: require first significant token if long enough (e.g. "microsoft")
    const first = nameNorm.split(/\s+/).find(t => t.length >= 4)
    if (first && text.includes(first)) return true
  }

  return false
}

/** Max length for headline + summary + source (URL appended after, not counted in trim). */
const MAX_BODY_CHARS = 360

/**
 * Build one display/impact bullet from Finnhub fields.
 * Prefer "Headline — summary (Source)" + article URL when present.
 */
export function formatFinnhubBullet(article: FinnhubCompanyArticle): string | null {
  const headline = String(article.headline ?? '').trim()
  if (!headline) return null

  const summary = String(article.summary ?? '').trim()
  const source = String(article.source ?? '').trim()
  const urlRaw = String(article.url ?? '').trim()
  const url =
    urlRaw.startsWith('http://') || urlRaw.startsWith('https://') ? urlRaw : ''

  // Drop summary if empty or essentially the same as the headline
  const summaryUseful =
    summary.length > 0 &&
    summary.toLowerCase() !== headline.toLowerCase() &&
    !headline.toLowerCase().includes(summary.toLowerCase())

  let body = summaryUseful ? `${headline} — ${summary}` : headline
  if (source) {
    body = `${body} (${source})`
  }

  if (body.length > MAX_BODY_CHARS) {
    body = body.slice(0, MAX_BODY_CHARS - 1).trimEnd() + '…'
  }

  // Append URL last so UI can linkify; keep full URL for the browser
  return url ? `${body} ${url}` : body
}

/**
 * Map Finnhub articles → up to 3 short bullet strings (newest first).
 * Drops articles that do not mention the holding ticker/name.
 * Includes article summary when present (needed for impact analysis).
 */
export function articlesToNewsBullets(
  articles: FinnhubCompanyArticle[],
  options: {
    symbol: string
    companyName?: string
    maxBullets?: number
  }
): string[] {
  const { symbol, companyName, maxBullets = 3 } = options
  const relevant = articles.filter(a =>
    isArticleRelevantToHolding(a, symbol, companyName)
  )

  const sorted = [...relevant].sort(
    (a, b) => (b.datetime ?? 0) - (a.datetime ?? 0)
  )

  const bullets: string[] = []
  const seen = new Set<string>()

  for (const article of sorted) {
    const headline = String(article.headline ?? '').trim()
    if (!headline) continue
    const key = headline.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const bullet = formatFinnhubBullet(article)
    if (!bullet) continue
    bullets.push(bullet)
    if (bullets.length >= maxBullets) break
  }

  return bullets
}

/**
 * Fetch company news for a stock/ETF symbol between fromDate and toDate (YYYY-MM-DD).
 * companyName improves relevance filtering (e.g. "Apple Inc.").
 * Returns [] on missing key, HTTP errors, or no relevant articles.
 */
export async function fetchFinnhubCompanyNewsBullets(
  symbol: string,
  fromDate: string,
  toDate: string,
  companyName?: string
): Promise<string[]> {
  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) {
    console.error('Missing FINNHUB_API_KEY — stock/ETF holding news unavailable')
    return []
  }

  const upper = symbol.toUpperCase().trim()
  if (!upper) return []

  const url =
    `${FINNHUB_COMPANY_NEWS}?symbol=${encodeURIComponent(upper)}` +
    `&from=${encodeURIComponent(fromDate)}` +
    `&to=${encodeURIComponent(toDate)}` +
    `&token=${encodeURIComponent(apiKey)}`

  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      console.error(
        'Finnhub company-news error',
        upper,
        res.status,
        (await res.text().catch(() => '')).slice(0, 200)
      )
      return []
    }

    const data: unknown = await res.json()
    if (!Array.isArray(data)) {
      console.error('Finnhub company-news unexpected payload', upper)
      return []
    }

    const articles = data as FinnhubCompanyArticle[]
    const bullets = articlesToNewsBullets(articles, {
      symbol: upper,
      companyName,
    })

    if (process.env.NODE_ENV === 'development') {
      console.log(
        `Finnhub news ${upper} ${fromDate}..${toDate}: ${articles.length} raw → ${bullets.length} relevant bullets`
      )
    }
    return bullets
  } catch (e) {
    console.error('Finnhub company-news fetch failed', upper, e)
    return []
  }
}
