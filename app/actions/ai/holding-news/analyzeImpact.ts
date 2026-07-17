/**
 * News impact analysis — sub-step of Holding News (no live search).
 *
 * Runs after news bullets are fetched. For each holding that has ≥1 bullet,
 * asks Grok (generateObject) for a rough near-term read:
 *   tone (positive | neutral | negative | mixed)
 *   outlook (one short sentence)
 *   points (up to 3 bullets — mechanisms / what to watch)
 *
 * Not a server action: imported only by generateHoldingNews.
 * Fail-open: returns {} on empty input or LLM errors so news can still be saved.
 */

import {
  holdingNewsImpactSchema,
  type HoldingNewsImpactEntry,
  type NewsImpactTone,
} from '@/lib/schemas'
import { buildImpactSystemPrompt, buildImpactUserPrompt } from './prompts'

/** Allowed tone enum values (mirrors Zod schema; used for post-normalize). */
const TONES: NewsImpactTone[] = ['positive', 'neutral', 'negative', 'mixed']

/** Hard cap so outlook fits holding-card tooltips. */
const OUTLOOK_MAX_CHARS = 160

/** Minimal holding identity for the impact prompt (same set as news fetch). */
export type HoldingMeta = { symbol: string; assetType: string; name: string }

/**
 * Synthesize per-holding impact from already-fetched news bullets.
 *
 * - Only symbols with non-empty news are sent to the model (avoids invented impact).
 * - No web/X tools: synthesis only, cheaper than another live search.
 * - Dynamic import of AI SDK so this module stays light when unused.
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

  // Restrict normalize to symbols we actually asked about
  const bySymbol = new Map(withNews.map(h => [h.symbol, h]))

  // Compact multi-holding prompt block for one batched LLM call
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
      system: buildImpactSystemPrompt(),
      prompt: buildImpactUserPrompt(block),
    })

    return normalizeImpact(object.impact, bySymbol)
  } catch (e) {
    // Caller treats empty impact as optional UI; news path continues
    console.error('News impact analysis failed', e)
    return {}
  }
}

/**
 * Align model output with requested holdings and UI constraints.
 * Drop unknown symbols; default bad tone → neutral; clamp outlook/points.
 */
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
