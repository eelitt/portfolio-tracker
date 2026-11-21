/**
 * Cost basis versus market value for open spot holdings, from snapshot rows.
 * Cash and futures are not part of either line. Totals stay in the row currency
 * (USD as stored). Display conversion happens in the snapshot action.
 */

import { holdingSeriesId, type SnapshotPoint } from '@/lib/aggregateSnapshots'

export type InvestedSnapshotRow = {
  snapshotDate: string
  symbol: string
  assetType: string
  marketValue: number
  costBasis: number
  isPartial: boolean
}

export type InvestedVsCashSeries = {
  portfolio: SnapshotPoint[]
  /** Keys are `assetType:symbol` from holdingSeriesId. */
  byHolding: Record<string, SnapshotPoint[]>
}

type DaySum = {
  marketValue: number
  costBasis: number
  kept: boolean
  dropped: boolean
}

function isSpot(assetType: string): boolean {
  return assetType === 'stock' || assetType === 'etf' || assetType === 'crypto'
}

/** A missing mark is stored as partial or as a zero market value. Neither is a loss. */
function isPriced(row: InvestedSnapshotRow): boolean {
  return (
    !row.isPartial &&
    Number.isFinite(row.marketValue) &&
    row.marketValue > 0 &&
    Number.isFinite(row.costBasis)
  )
}

function emptyDay(): DaySum {
  return { marketValue: 0, costBasis: 0, kept: false, dropped: false }
}

function addRow(day: DaySum, row: InvestedSnapshotRow) {
  if (isPriced(row)) {
    day.marketValue += row.marketValue
    day.costBasis += row.costBasis
    day.kept = true
    return
  }
  day.dropped = true
}

function toPoint(date: string, day: DaySum): SnapshotPoint | null {
  if (!day.kept) return null
  return {
    date,
    marketValue: day.marketValue,
    costBasis: day.costBasis,
    isPartial: day.dropped,
  }
}

function pointsFromDays(days: Map<string, DaySum>): SnapshotPoint[] {
  const points: SnapshotPoint[] = []
  for (const date of [...days.keys()].sort((a, b) => a.localeCompare(b))) {
    const point = toPoint(date, days.get(date)!)
    if (point) points.push(point)
  }
  return points
}

/**
 * Sum priced stock, ETF, and crypto rows per day.
 * An unpriced spot row leaves both lines. A day with only unpriced spot rows is omitted.
 */
export function buildInvestedVsCashSeries(
  rows: InvestedSnapshotRow[]
): InvestedVsCashSeries {
  const portfolioDays = new Map<string, DaySum>()
  const holdingDays = new Map<string, Map<string, DaySum>>()

  for (const row of rows) {
    if (!isSpot(row.assetType)) continue
    const date = row.snapshotDate.slice(0, 10)
    const symbol = row.symbol.trim()
    if (!date || !symbol) continue

    let portfolio = portfolioDays.get(date)
    if (!portfolio) {
      portfolio = emptyDay()
      portfolioDays.set(date, portfolio)
    }
    addRow(portfolio, row)

    const id = holdingSeriesId(row.assetType, symbol)
    let byDate = holdingDays.get(id)
    if (!byDate) {
      byDate = new Map()
      holdingDays.set(id, byDate)
    }
    let holding = byDate.get(date)
    if (!holding) {
      holding = emptyDay()
      byDate.set(date, holding)
    }
    addRow(holding, row)
  }

  const byHolding: Record<string, SnapshotPoint[]> = {}
  for (const [id, days] of holdingDays) {
    const points = pointsFromDays(days)
    if (points.length > 0) byHolding[id] = points
  }

  return {
    portfolio: pointsFromDays(portfolioDays),
    byHolding,
  }
}
