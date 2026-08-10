/**
 * Validate orchestrator → analyst news handoff.
 * Rejects free-form invented payloads (Zod) and optionally requires
 * a successful news agent run in the same request (caller flag).
 */

import { z } from 'zod'
import type { NewsAgentOutput, NewsHoldingResult } from './types'

const impactSchema = z
  .object({
    tone: z.string().max(64),
    outlook: z.string().max(2000),
    points: z.array(z.string().max(500)).max(5).optional(),
  })
  .strict()

const holdingSchema = z
  .object({
    symbol: z.string().min(1).max(32),
    assetType: z.string().max(32).optional(),
    bullets: z.array(z.string().max(1000)).max(8),
    impact: impactSchema.optional(),
  })
  .strict()

/** Slim schema: only fields the analyst may see as NEWS CONTEXT. */
export const newsContextHandoffSchema = z
  .object({
    ok: z.literal(true),
    holdings: z.array(holdingSchema).min(1).max(20),
    brief: z.string().max(12_000).optional(),
    asOf: z.string().max(64).optional(),
    statusNote: z.string().max(500).optional(),
  })
  .strict()

export type NewsContextHandoff = z.infer<typeof newsContextHandoffSchema>

export type ParseNewsContextResult =
  | { ok: true; news: NewsAgentOutput }
  | { ok: false; error: string }

/**
 * Parse and slim newsContext for the portfolio analyst.
 * Does not check request-scoped "news already ran" — caller must.
 */
export function parseNewsContextHandoff(raw: unknown): ParseNewsContextResult {
  const parsed = newsContextHandoffSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      error:
        'Invalid newsContext. Pass through structured output from invoke_news_agent only (do not invent headlines).',
    }
  }
  const d = parsed.data
  const holdings: NewsHoldingResult[] = d.holdings.map((h) => ({
    symbol: h.symbol,
    assetType: h.assetType,
    bullets: h.bullets,
    impact: h.impact
      ? {
          tone: h.impact.tone,
          outlook: h.impact.outlook,
          points: h.impact.points,
        }
      : undefined,
  }))
  return {
    ok: true,
    news: {
      ok: true,
      fromCache: false,
      updatedCache: false,
      holdings,
      brief: d.brief,
      asOf: d.asOf,
      statusNote: d.statusNote,
    },
  }
}
