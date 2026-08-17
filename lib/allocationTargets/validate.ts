import type { AssetType } from '@/lib/types'
import { ALLOC_ASSET_TYPES, type AllocationPolicySpec, type SymbolOverride, type TypeWeightMap } from './types'

const SUM_EPS = 0.05

export function emptyTypeWeights(): TypeWeightMap {
  return { stock: 0, etf: 0, crypto: 0, cash: 0 }
}

export function normalizeTypeWeights(
  partial: Partial<Record<AssetType, number>>
): TypeWeightMap {
  const out = emptyTypeWeights()
  for (const t of ALLOC_ASSET_TYPES) {
    const n = Number(partial[t] ?? 0)
    out[t] = Number.isFinite(n) ? n : 0
  }
  return out
}

export function validatePolicySpec(spec: {
  typeWeights: Partial<Record<AssetType, number>>
  symbolOverrides?: SymbolOverride[]
  tolerancePp?: number
}): { ok: true; spec: AllocationPolicySpec } | { ok: false; error: string } {
  const typeWeights = normalizeTypeWeights(spec.typeWeights)
  for (const t of ALLOC_ASSET_TYPES) {
    if (typeWeights[t] < 0 || typeWeights[t] > 100) {
      return { ok: false, error: `${t} weight must be between 0 and 100.` }
    }
  }
  const sum = ALLOC_ASSET_TYPES.reduce((s, t) => s + typeWeights[t], 0)
  if (Math.abs(sum - 100) > SUM_EPS) {
    return { ok: false, error: `Type weights must sum to 100% (now ${sum.toFixed(1)}%).` }
  }

  const tolerancePp = spec.tolerancePp ?? 5
  if (!(tolerancePp >= 0) || tolerancePp > 50) {
    return { ok: false, error: 'Tolerance must be between 0 and 50 percentage points.' }
  }

  const symbolOverrides = spec.symbolOverrides ?? []
  const seen = new Set<string>()
  const byType: Partial<Record<AssetType, number>> = {}

  for (const row of symbolOverrides) {
    const sym = row.symbol.trim().toUpperCase()
    if (!sym) return { ok: false, error: 'Symbol override is missing a ticker.' }
    if (seen.has(sym)) {
      return { ok: false, error: `Duplicate symbol override: ${sym}.` }
    }
    seen.add(sym)
    if (row.weightPercent < 0 || row.weightPercent > 100) {
      return { ok: false, error: `${sym} weight must be between 0 and 100.` }
    }
    byType[row.assetType] = (byType[row.assetType] ?? 0) + row.weightPercent
  }

  for (const t of ALLOC_ASSET_TYPES) {
    if (t === 'cash') continue
    const used = byType[t] ?? 0
    if (used - typeWeights[t] > SUM_EPS) {
      return {
        ok: false,
        error: `Symbol overrides for ${t} (${used}%) exceed the ${t} bucket (${typeWeights[t]}%).`,
      }
    }
  }

  return {
    ok: true,
    spec: {
      typeWeights,
      symbolOverrides: symbolOverrides.map((r) => ({
        ...r,
        symbol: r.symbol.trim().toUpperCase(),
      })),
      tolerancePp,
    },
  }
}
