import { allocationBreakdown } from '@/lib/portfolioAnalyst'
import type { EnrichedHolding } from '@/lib/types'
import { ALLOC_ASSET_TYPES, type AllocationPolicySpec, type DriftRow } from './types'

function statusOf(deltaPp: number, tolerancePp: number): DriftRow['status'] {
  if (deltaPp > tolerancePp) return 'over'
  if (deltaPp < -tolerancePp) return 'under'
  return 'ok'
}

function row(
  key: string,
  scope: DriftRow['scope'],
  actualPercent: number,
  targetPercent: number,
  totalMv: number,
  tolerancePp: number
): DriftRow {
  const deltaPp = Number((actualPercent - targetPercent).toFixed(2))
  return {
    key,
    scope,
    actualPercent: Number(actualPercent.toFixed(2)),
    targetPercent: Number(targetPercent.toFixed(2)),
    deltaPp,
    deltaValue: Number(((deltaPp / 100) * totalMv).toFixed(2)),
    status: statusOf(deltaPp, tolerancePp),
  }
}

export function computeDrift(
  holdings: EnrichedHolding[],
  spec: AllocationPolicySpec
): {
  totalMarketValue: number
  unpricedSymbols: string[]
  byType: DriftRow[]
  bySymbol: DriftRow[]
} {
  const alloc = allocationBreakdown(holdings)
  const total = alloc.totalMarketValue
  const typeActual: Record<string, number> = {
    stock: 0,
    etf: 0,
    crypto: 0,
    cash: 0,
  }
  for (const s of alloc.byAssetType) {
    typeActual[s.key] = s.weightPercent
  }
  const symbolActual = new Map(alloc.bySymbol.map((s) => [s.key.toUpperCase(), s.weightPercent]))

  const byType = ALLOC_ASSET_TYPES.map((t) =>
    row(t, 'asset_type', typeActual[t] ?? 0, spec.typeWeights[t], total, spec.tolerancePp)
  )

  const bySymbol = spec.symbolOverrides.map((o) =>
    row(
      o.symbol,
      'symbol',
      symbolActual.get(o.symbol.toUpperCase()) ?? 0,
      o.weightPercent,
      total,
      spec.tolerancePp
    )
  )

  return {
    totalMarketValue: total,
    unpricedSymbols: alloc.unpricedSymbols,
    byType,
    bySymbol,
  }
}
