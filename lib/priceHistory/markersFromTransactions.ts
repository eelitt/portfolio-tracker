import type { Transaction } from '@/lib/types'
import type { Currency } from '@/lib/currency'
import { convertBetweenCurrencies } from '@/lib/currency'
import type { TradeMarker } from './types'

/**
 * Map user buy/sell transactions for a symbol into chart markers.
 * unit_price converted from tx currency into preferred display currency.
 */
export function markersFromTransactions(
  transactions: Transaction[],
  symbol: string,
  preferredCurrency: Currency,
  usdToEurRate: number
): TradeMarker[] {
  const upper = symbol.toUpperCase()
  const markers: TradeMarker[] = []

  for (const tx of transactions || []) {
    if ((tx.symbol || '').toUpperCase() !== upper) continue
    if (tx.asset_type === 'cash') continue
    if (tx.action !== 'buy' && tx.action !== 'sell') continue

    const qty = Number(tx.quantity)
    const unit = Number(tx.unit_price)
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unit) || unit <= 0) {
      continue
    }

    const entryCurr = (tx.currency || 'USD') as Currency
    const price = convertBetweenCurrencies(
      unit,
      entryCurr,
      preferredCurrency,
      usdToEurRate
    )

    const executed = tx.executed_at || ''
    const timeKey = executed.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(timeKey)) continue

    markers.push({
      time: executed,
      timeKey,
      side: tx.action,
      price,
      quantity: qty,
      currency: preferredCurrency,
      notes: tx.notes ?? null,
    })
  }

  markers.sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  )
  return markers
}

/** Group markers by calendar day (YYYY-MM-DD) for tooltips + one chart marker per day. */
export function groupMarkersByDay(
  markers: TradeMarker[]
): Map<string, TradeMarker[]> {
  const map = new Map<string, TradeMarker[]>()
  for (const m of markers) {
    const list = map.get(m.timeKey)
    if (list) list.push(m)
    else map.set(m.timeKey, [m])
  }
  return map
}

export type DayMarkerStyle = {
  timeKey: string
  /** Marker id for lightweight-charts hover matching */
  id: string
  text: string
  side: 'buy' | 'sell' | 'mixed'
  color: string
  position: 'belowBar' | 'aboveBar'
  shape: 'arrowUp' | 'arrowDown' | 'circle'
}

/**
 * One visual marker per day. Label encodes multi-trade days (e.g. "2", "B+S").
 */
export function dayMarkerStyles(
  byDay: Map<string, TradeMarker[]>
): DayMarkerStyle[] {
  const out: DayMarkerStyle[] = []
  for (const [timeKey, trades] of byDay) {
    const buys = trades.filter((t) => t.side === 'buy').length
    const sells = trades.filter((t) => t.side === 'sell').length
    let side: DayMarkerStyle['side']
    let text: string
    let color: string
    let position: DayMarkerStyle['position']
    let shape: DayMarkerStyle['shape']

    if (buys > 0 && sells > 0) {
      side = 'mixed'
      text = trades.length > 2 ? String(trades.length) : 'B+S'
      color = '#a855f7'
      position = 'aboveBar'
      shape = 'circle'
    } else if (sells > 0) {
      side = 'sell'
      text = sells > 1 ? String(sells) : 'S'
      color = '#dc2626'
      position = 'aboveBar'
      shape = 'arrowDown'
    } else {
      side = 'buy'
      text = buys > 1 ? String(buys) : 'B'
      color = '#16a34a'
      position = 'belowBar'
      shape = 'arrowUp'
    }

    out.push({
      timeKey,
      id: timeKey,
      text,
      side,
      color,
      position,
      shape,
    })
  }
  return out.sort((a, b) => a.timeKey.localeCompare(b.timeKey))
}
