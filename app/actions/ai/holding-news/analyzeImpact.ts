import {
  holdingNewsImpactSchema,
  type HoldingNewsImpactEntry,
  type NewsImpactTone,
} from '@/lib/schemas'

const TONES: NewsImpactTone[] = ['positive', 'neutral', 'negative', 'mixed']
const OUTLOOK_MAX_CHARS = 160

export type HoldingMeta = { symbol: string; assetType: string; name: string }

/**
 * Synthesize per-holding impact from already-fetched news bullets.
 * No live search tools — cheap generateObject pass only.
 * Returns {} if nothing to analyze or the model call fails (caller fail-open).
 */
export async function analyzeNewsImpact(
  news: Record<string, string[]>,
  holdings: HoldingMeta[]
): Promise<Record<string, HoldingNewsImpactEntry>> {
  const withNews = holdings.filter(
    h => Array.isArray(news[h.symbol]) && news[h.symbol].length > 0
  )
  if (withNews.length === 0) {
    return {}
  }

  const bySymbol = new Map(withNews.map(h => [h.symbol, h]))
  const block = withNews
    .map(h => {
      const bullets = news[h.symbol].map(b => `  • ${b}`).join('\n')
      return `${h.symbol} (${h.assetType}) — ${h.name}\n${bullets}`
    })
    .join('\n\n')

  try {
    const { generateObject } = await import('ai')
    const { xai } = await import('@ai-sdk/xai')

    const { object } = await generateObject({
      model: xai('grok-4.3'),
      schema: holdingNewsImpactSchema,
      temperature: 0.2,
      maxTokens: 500,
      system: `You analyze portfolio holding news for rough near-term implications.
For each holding, return:
- tone: exactly one of positive | neutral | negative | mixed
- outlook: one short sentence (rough forward read, not a prediction)
- points: 2–3 short bullets on mechanisms / what to watch (do not restate headlines verbatim)

Rules:
- Base conclusions only on the provided news bullets. Do not invent events.
- Qualitative only: no price targets, no % forecasts, no buy/sell/hold recommendations.
- If implications are unclear, use tone "neutral" and a cautious outlook.
- Keys MUST be the exact uppercase tickers provided.
- Not financial advice — stay measured.`,
      prompt: `Analyze impact for these holdings and their news:

${block}

Return JSON: { "impact": { "SYMBOL": { "tone", "outlook", "points" } } }`,
    })

    return normalizeImpact(object.impact, bySymbol)
  } catch (e) {
    console.error('News impact analysis failed', e)
    return {}
  }
}

function normalizeImpact(
  raw: Record<string, HoldingNewsImpactEntry>,
  bySymbol: Map<string, HoldingMeta>
): Record<string, HoldingNewsImpactEntry> {
  const out: Record<string, HoldingNewsImpactEntry> = {}

  for (const [key, entry] of Object.entries(raw ?? {})) {
    const symbol = key.toUpperCase().trim()
    if (!bySymbol.has(symbol) || !entry) continue

    const tone: NewsImpactTone = TONES.includes(entry.tone as NewsImpactTone)
      ? (entry.tone as NewsImpactTone)
      : 'neutral'

    let outlook = String(entry.outlook ?? '').trim()
    if (outlook.length > OUTLOOK_MAX_CHARS) {
      outlook = outlook.slice(0, OUTLOOK_MAX_CHARS - 1).trimEnd() + '…'
    }
    if (!outlook) {
      outlook = 'No clear directional impact from available items.'
    }

    const points = (Array.isArray(entry.points) ? entry.points : [])
      .map(p => String(p).trim())
      .filter(Boolean)
      .slice(0, 3)

    out[symbol] = { tone, outlook, points }
  }

  return out
}
