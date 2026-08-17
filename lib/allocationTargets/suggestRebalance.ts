import { allocationBreakdown } from '@/lib/portfolioAnalyst'
import type { AssetType, EnrichedHolding } from '@/lib/types'
import { ALLOC_ASSET_TYPES, type AllocationPolicySpec, type RebalanceMode, type RebalanceSuggestion } from './types'

function round2(n: number) {
  return Number(n.toFixed(2))
}

function typeOfHolding(h: EnrichedHolding): AssetType {
  return h.asset_type
}

function largestPricedInType(
  holdings: EnrichedHolding[],
  assetType: AssetType,
  preferOver: Set<string>
): EnrichedHolding | null {
  const priced = holdings.filter(
    (h) =>
      h.asset_type === assetType &&
      h.priceAvailable &&
      h.asset_type !== 'cash' &&
      h.marketValue > 0
  )
  if (priced.length === 0) return null
  const over = priced.filter((h) => preferOver.has(h.symbol.toUpperCase()))
  const pool = over.length ? over : priced
  return [...pool].sort((a, b) => b.marketValue - a.marketValue)[0] ?? null
}

function underSymbolInType(
  spec: AllocationPolicySpec,
  assetType: AssetType,
  symbolActualPct: Map<string, number>
): string | null {
  const unders = spec.symbolOverrides.filter((o) => {
    if (o.assetType !== assetType) return false
    const actual = symbolActualPct.get(o.symbol.toUpperCase()) ?? 0
    return actual + 0.01 < o.weightPercent
  })
  if (unders.length === 0) return null
  unders.sort((a, b) => {
    const da = a.weightPercent - (symbolActualPct.get(a.symbol) ?? 0)
    const db = b.weightPercent - (symbolActualPct.get(b.symbol) ?? 0)
    return db - da
  })
  return unders[0].symbol
}

export function suggestRebalance(
  holdings: EnrichedHolding[],
  spec: AllocationPolicySpec,
  opts: { mode: RebalanceMode; cashIn?: number }
): { suggestions: RebalanceSuggestion[]; notes: string[] } {
  const alloc = allocationBreakdown(holdings)
  const notes: string[] = []
  if (alloc.unpricedSymbols.length > 0) {
    notes.push(`Unpriced (excluded from weights): ${alloc.unpricedSymbols.join(', ')}`)
  }

  const typeMv: Record<AssetType, number> = { stock: 0, etf: 0, crypto: 0, cash: 0 }
  for (const s of alloc.byAssetType) {
    if (s.key in typeMv) typeMv[s.key as AssetType] = s.marketValue
  }

  const symbolPct = new Map(alloc.bySymbol.map((s) => [s.key.toUpperCase(), s.weightPercent]))
  const overSymbols = new Set(
    spec.symbolOverrides
      .filter((o) => (symbolPct.get(o.symbol) ?? 0) - o.weightPercent > spec.tolerancePp)
      .map((o) => o.symbol.toUpperCase())
  )

  if (opts.mode === 'new_cash') {
    const cashIn = Number(opts.cashIn ?? 0)
    if (!(cashIn > 0)) {
      return { suggestions: [], notes: [...notes, 'Enter a cash amount to invest.'] }
    }
    const newTotal = alloc.totalMarketValue + cashIn
    if (newTotal <= 0) {
      return { suggestions: [], notes: [...notes, 'No book to allocate into.'] }
    }
    const needs: { type: AssetType; need: number }[] = []
    for (const t of ALLOC_ASSET_TYPES) {
      if (t === 'cash') continue
      const desired = (spec.typeWeights[t] / 100) * newTotal
      const actual = typeMv[t]
      const gap = desired - actual
      const band = (spec.tolerancePp / 100) * newTotal
      if (gap > band) needs.push({ type: t, need: gap })
    }
    const needSum = needs.reduce((s, n) => s + n.need, 0)
    if (needSum <= 0) {
      return {
        suggestions: [],
        notes: [...notes, 'New cash would not fill an underweight type outside the tolerance band.'],
      }
    }
    const suggestions: RebalanceSuggestion[] = []
    for (const n of needs) {
      const notional = round2(Math.min(n.need, (n.need / needSum) * cashIn))
      if (notional <= 0) continue
      const ticker = underSymbolInType(spec, n.type, symbolPct)
      suggestions.push({
        side: 'buy',
        key: ticker ?? n.type,
        keyKind: ticker ? 'symbol' : 'asset_type',
        notional,
        reason: `Invest new cash toward underweight ${n.type}.`,
      })
    }
    return { suggestions, notes }
  }

  const total = alloc.totalMarketValue
  if (!(total > 0)) {
    return { suggestions: [], notes: [...notes, 'No priced holdings or cash to rebalance.'] }
  }

  const band = (spec.tolerancePp / 100) * total
  const delta: Record<AssetType, number> = emptyDelta()
  for (const t of ALLOC_ASSET_TYPES) {
    delta[t] = (spec.typeWeights[t] / 100) * total - typeMv[t]
  }

  const suggestions: RebalanceSuggestion[] = []
  let cashAvailable = delta.cash < -band ? -delta.cash : 0

  const unders = ALLOC_ASSET_TYPES.filter((t) => t !== 'cash' && delta[t] > band).sort(
    (a, b) => delta[b] - delta[a]
  )
  const leftoverOver: Record<AssetType, number> = emptyDelta()
  for (const t of ALLOC_ASSET_TYPES) {
    if (t !== 'cash' && delta[t] < -band) leftoverOver[t] = -delta[t]
  }

  for (const t of unders) {
    let need = delta[t]
    const fromCash = Math.min(need, cashAvailable)
    if (fromCash > 0) {
      const ticker = underSymbolInType(spec, t, symbolPct)
      suggestions.push({
        side: 'buy',
        key: ticker ?? t,
        keyKind: ticker ? 'symbol' : 'asset_type',
        notional: round2(fromCash),
        reason: `Fund underweight ${t} with excess cash.`,
      })
      cashAvailable -= fromCash
      need -= fromCash
    }
    if (need <= band) continue
    for (const src of ALLOC_ASSET_TYPES) {
      if (src === 'cash' || src === t) continue
      const take = Math.min(need, leftoverOver[src] ?? 0)
      if (take <= 0) continue
      const sellH = largestPricedInType(holdings, src, overSymbols)
      if (!sellH) continue
      suggestions.push({
        side: 'sell',
        key: sellH.symbol,
        keyKind: 'symbol',
        notional: round2(Math.min(take, sellH.marketValue)),
        reason: `Trim overweight ${src} to fund ${t}.`,
      })
      const buyTicker = underSymbolInType(spec, t, symbolPct)
      suggestions.push({
        side: 'buy',
        key: buyTicker ?? t,
        keyKind: buyTicker ? 'symbol' : 'asset_type',
        notional: round2(Math.min(take, sellH.marketValue)),
        reason: `Add to underweight ${t}.`,
      })
      leftoverOver[src] -= take
      need -= take
      if (need <= band) break
    }
  }

  return { suggestions, notes }
}

function emptyDelta(): Record<AssetType, number> {
  return { stock: 0, etf: 0, crypto: 0, cash: 0 }
}
