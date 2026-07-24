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
