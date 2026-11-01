import type { AssetType, PositionSide } from '@/lib/types'
import { colorForHoldingSymbol } from '@/lib/aggregateSnapshots'
import { catalogNameFor } from '@/lib/portfolioAnalyst'
import { getAssetTypeLabel } from '@/lib/utils'
import { historySymbolLabel } from '@/app/(app)/dashboard/transactions/transactionUtils'

export type AllocationHolding = {
  symbol: string
  marketValue: number
  asset_type?: AssetType | 'future'
  positionSide?: PositionSide | null
  priceAvailable?: boolean
}

export type AllocationPart = {
  id: string
  name: string
  value: number
  percent: number
}

export type AllocationSlice = {
  id: string
  name: string
  subtitle?: string
  value: number
  percent: number
  color: string
  /** Holdings rolled into the Other slice, largest first. */
  parts?: AllocationPart[]
}

const OTHER_COLOR = '#94a3b8'
const MAX_NAMED_SLICES = 7
const MIN_SLICE_PCT = 0.025

function holdingId(h: AllocationHolding): string {
  if (h.asset_type === 'future' && (h.positionSide === 'long' || h.positionSide === 'short')) {
    return `future:${h.symbol}:${h.positionSide}`
  }
  return `${h.asset_type ?? 'x'}:${h.symbol}`
}

function holdingLabel(h: AllocationHolding): { name: string; subtitle?: string } {
  if (h.asset_type === 'future') {
    if (h.positionSide === 'long' || h.positionSide === 'short') {
      return {
        name: historySymbolLabel({
          symbol: h.symbol,
          asset_type: 'future',
          position_side: h.positionSide,
        }),
        subtitle: 'Perp',
      }
    }
    return { name: h.symbol, subtitle: 'Perp' }
  }
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
  const otherHoldings: typeof positive = []

  for (const h of positive) {
    const pct = h.marketValue / total
    if (named.length < MAX_NAMED_SLICES && pct >= MIN_SLICE_PCT) {
      named.push(h)
    } else {
      otherHoldings.push(h)
    }
  }

  const slices: AllocationSlice[] = named.map((h) => {
    const label = holdingLabel(h)
    return {
      id: holdingId(h),
      name: label.name,
      subtitle: label.subtitle,
      value: h.marketValue,
      percent: h.marketValue / total,
      color: colorForHoldingSymbol(
        h.asset_type === 'future' && h.positionSide
          ? `${h.symbol} ${h.positionSide}`
          : h.symbol
      ),
    }
  })

  if (otherHoldings.length > 0) {
    const otherValue = otherHoldings.reduce((s, h) => s + h.marketValue, 0)
    slices.push({
      id: 'other',
      name: 'Other',
      value: otherValue,
      percent: otherValue / total,
      color: OTHER_COLOR,
      parts: otherHoldings.map((h) => ({
        id: holdingId(h),
        name: holdingLabel(h).name,
        value: h.marketValue,
        percent: h.marketValue / total,
      })),
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
