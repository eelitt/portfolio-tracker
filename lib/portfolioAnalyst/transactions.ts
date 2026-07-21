/**
 * Compact / filter transaction lists for analyst tool payloads.
 */

import type { AssetType, Transaction } from '../types'
import { roundMoney } from './shared'

/**
 * Compact list of transactions for the agent (filter + newest-first + hard cap).
 */
export function compactTransactions(
  transactions: Transaction[],
  options: {
    symbol?: string
    assetType?: AssetType
    action?: Transaction['action']
    year?: number
    limit?: number
  } = {}
) {
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 40)
  let list = [...(transactions || [])]

  if (options.symbol) {
    const sym = options.symbol.toUpperCase()
    list = list.filter((t) => t.symbol.toUpperCase() === sym)
  }
  if (options.assetType) {
    list = list.filter((t) => t.asset_type === options.assetType)
  }
  if (options.action) {
    list = list.filter((t) => t.action === options.action)
  }
  if (options.year !== undefined) {
    list = list.filter((t) => new Date(t.executed_at).getUTCFullYear() === options.year)
  }

  list.sort(
    (a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime()
  )

  return list.slice(0, limit).map((t) => ({
    symbol: t.symbol,
    assetType: t.asset_type,
    action: t.action,
    quantity: Number(t.quantity),
    unitPrice: roundMoney(Number(t.unit_price)),
    executedAt: t.executed_at,
    currency: t.currency ?? null,
    notes: t.notes ? String(t.notes).slice(0, 120) : undefined,
  }))
}
