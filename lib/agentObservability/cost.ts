/**
 * Indicative USD cost from token usage.
 * Rates are approximate — label UI as “estimated”, not billing truth.
 */

import type { TokenUsage } from './types'

/** USD per 1M tokens (input / output). Update when provider pricing changes. */
const MODEL_RATES: Record<string, { inputPerM: number; outputPerM: number }> = {
  'grok-4.3': { inputPerM: 3, outputPerM: 15 },
  'grok-4': { inputPerM: 3, outputPerM: 15 },
  'grok-3': { inputPerM: 3, outputPerM: 15 },
  default: { inputPerM: 3, outputPerM: 15 },
}

/** Returns null when usage is missing or zero. */
export function estimateCostUsd(
  model: string | null | undefined,
  usage: TokenUsage | null | undefined
): number | null {
  if (!usage) return null
  const prompt = usage.promptTokens ?? 0
  const completion = usage.completionTokens ?? 0
  if (prompt === 0 && completion === 0) return null

  const key = (model || 'default').toLowerCase()
  const rates =
    MODEL_RATES[key] ||
    Object.entries(MODEL_RATES).find(([k]) => key.includes(k))?.[1] ||
    MODEL_RATES.default

  const usd =
    (prompt / 1_000_000) * rates.inputPerM + (completion / 1_000_000) * rates.outputPerM
  return Number(usd.toFixed(6))
}
