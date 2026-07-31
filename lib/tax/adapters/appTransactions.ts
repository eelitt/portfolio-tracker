/**
 * Map app portfolio Transaction rows → TaxableEvent[] (EUR).
 * Only place in lib/tax that knows about Transaction / asset_type actions.
 */

import { convertBetweenCurrencies } from '@/lib/currency'
import type { Transaction } from '@/lib/types'
import type { TaxAssetClass, TaxableEvent } from '../types'

export type AppTxAdapterOptions = {
  /** USD→EUR rate (same convention as lib/currency) */
  usdToEurRate: number
}

function assetClassOf(assetType: Transaction['asset_type']): TaxAssetClass | null {
  if (assetType === 'crypto') return 'crypto'
  if (assetType === 'stock' || assetType === 'etf') return 'security'
  return null // cash
}

function toEur(
  amount: number,
  currency: 'USD' | 'EUR' | undefined,
  usdToEurRate: number
): number {
  const from = currency === 'EUR' ? 'EUR' : 'USD'
  return convertBetweenCurrencies(amount, from, 'EUR', usdToEurRate)
}

/**
 * Convert app transactions into tax events.
 * - buy → acquisition, sell → disposal
 * - cash / inflow / outflow skipped
 * - unit prices converted to EUR
 */
export function appTransactionsToTaxableEvents(
  transactions: Transaction[],
  options: AppTxAdapterOptions
): TaxableEvent[] {
  const rate = options.usdToEurRate > 0 ? options.usdToEurRate : 0.92
  const events: TaxableEvent[] = []

  for (const tx of transactions || []) {
    const assetClass = assetClassOf(tx.asset_type)
    if (!assetClass) continue
    if (tx.action !== 'buy' && tx.action !== 'sell') continue

    const qty = Number(tx.quantity)
    const unit = Number(tx.unit_price)
    if (!(qty > 0) || !(unit >= 0)) continue

    const unitPriceEur = toEur(unit, tx.currency, rate)
    const id =
      tx.id && String(tx.id).length > 0
        ? String(tx.id)
        : `app:${tx.symbol}:${tx.action}:${tx.executed_at}:${qty}:${unit}`

    events.push({
      id,
      assetKey: String(tx.symbol).toUpperCase(),
      assetClass,
      type: tx.action === 'buy' ? 'acquisition' : 'disposal',
      quantity: qty,
      unitPriceEur,
      executedAt: tx.executed_at,
      source: { kind: 'app_transaction', transactionId: id },
      costKnown: true,
      notes: tx.notes,
    })
  }

  return events
}
