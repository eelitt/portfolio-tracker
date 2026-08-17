import type { AssetType } from '@/lib/types'
import { colorForHoldingSymbol } from '@/lib/aggregateSnapshots'
import { catalogNameFor } from '@/lib/portfolioAnalyst'
import { getAssetTypeLabel } from '@/lib/utils'

export type AllocationHolding = {
  symbol: string
  marketValue: number
  asset_type?: AssetType
  priceAvailable?: boolean
}

export type AllocationSlice = {
  id: string
  name: string
  subtitle?: string
  value: number
  percent: number
  color: string
}

const OTHER_COLOR = '#94a3b8'
const MAX_NAMED_SLICES = 7
const MIN_SLICE_PCT = 0.025

function holdingLabel(h: {
  symbol: string
  asset_type?: AssetType
}): { name: string; subtitle?: string } {
  if (!h.asset_type || h.asset_type === 'cash') {
    return { name: h.symbol, subtitle: 'Cash' }
  }
  const full = catalogNameFor(h.symbol, h.asset_type)
  if (full && full.toUpperCase() !== h.symbol.toUpperCase()) {
    return { name: h.symbol, subtitle: full }
  }
  return { name: h.symbol }
}

export function buildHoldingSlices(
  holdings: AllocationHolding[]
): AllocationSlice[] {
  const positive = holdings
    .filter((h) => h.marketValue > 0)
    .sort((a, b) => b.marketValue - a.marketValue)

  const total = positive.reduce((s, h) => s + h.marketValue, 0)
  if (total <= 0) return []

  const named: typeof positive = []
  let otherValue = 0

  for (const h of positive) {
    const pct = h.marketValue / total
    if (named.length < MAX_NAMED_SLICES && pct >= MIN_SLICE_PCT) {
      named.push(h)
    } else {
      otherValue += h.marketValue
    }
  }

  const slices: AllocationSlice[] = named.map((h) => {
    const label = holdingLabel(h)
    return {
      id: `${h.asset_type ?? 'x'}:${h.symbol}`,
      name: label.name,
      subtitle: label.subtitle,
      value: h.marketValue,
      percent: h.marketValue / total,
      color: colorForHoldingSymbol(h.symbol),
    }
  })

  if (otherValue > 0) {
    slices.push({
      id: 'other',
      name: 'Other',
      value: otherValue,
      percent: otherValue / total,
      color: OTHER_COLOR,
    })
  }

  return slices
}

export function buildTypeSlices(
  holdings: AllocationHolding[]
): AllocationSlice[] {
  const byType = new Map<string, number>()
  for (const h of holdings) {
    if (!(h.marketValue > 0)) continue
    const t = h.asset_type ?? 'stock'
    byType.set(t, (byType.get(t) ?? 0) + h.marketValue)
  }
  const total = [...byType.values()].reduce((s, v) => s + v, 0)
  if (total <= 0) return []

  return [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, value]) => ({
      id: `type:${t}`,
      name: getAssetTypeLabel(t),
      value,
      percent: value / total,
      color: colorForHoldingSymbol(t.toUpperCase()),
    }))
}

export function unpricedHoldingCount(holdings: AllocationHolding[]): number {
  return holdings.filter(
    (h) => h.priceAvailable === false && h.asset_type !== 'cash'
  ).length
}
