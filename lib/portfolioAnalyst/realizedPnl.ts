/**
 * Realized P&L from transactions (weighted average cost) for the analyst agent.
 */

import type { AssetType, Transaction } from '../types'
import type { RealizedPnlFilters, RealizedPnlResult } from './types'
import { roundMoney } from './shared'

/**
 * Realized P&L from sell/outflow transactions using weighted average cost,
 * optionally filtered by calendar year of the sell, asset type, or symbol.
 */
export function realizedPnlFromTransactions(
  transactions: Transaction[],
  filters: RealizedPnlFilters = {}
): RealizedPnlResult {
  const normalized = (transactions || []).map((tx) => ({
    ...tx,
    quantity: Number(tx.quantity),
    unit_price: Number(tx.unit_price),
  }))

  // Full history per symbol for cost basis; year filter applies only to which sells count.
  const fullBySymbol = new Map<string, Transaction[]>()
  for (const tx of normalized) {
    if (filters.symbol && tx.symbol.toUpperCase() !== filters.symbol.toUpperCase()) continue
    if (filters.assetType && tx.asset_type !== filters.assetType) continue
    if (!fullBySymbol.has(tx.symbol)) fullBySymbol.set(tx.symbol, [])
    fullBySymbol.get(tx.symbol)!.push(tx)
  }

  const bySymbol: RealizedPnlResult['bySymbol'] = []
  let totalRealizedPnl = 0
  let sellCount = 0

  for (const [symbol, txs] of fullBySymbol) {
    const sorted = [...txs].sort(
      (a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime()
    )

    let quantity = 0
    let totalCost = 0
    let symbolRealized = 0
    let assetType: AssetType = sorted[0]?.asset_type ?? 'stock'
    let symbolSellCount = 0

    for (const tx of sorted) {
      assetType = tx.asset_type
      if (tx.action === 'buy' || tx.action === 'inflow') {
        totalCost += tx.quantity * tx.unit_price
        quantity += tx.quantity
      } else if (tx.action === 'sell' || tx.action === 'outflow') {
        if (quantity <= 0) continue
        const sellQ = Math.min(tx.quantity, quantity)
        const avgCost = totalCost / quantity
        const realized = sellQ * tx.unit_price - sellQ * avgCost

        const year = new Date(tx.executed_at).getUTCFullYear()
        const yearOk = filters.year === undefined || year === filters.year

        if (yearOk) {
          symbolRealized += realized
          symbolSellCount += 1
        }

        quantity -= sellQ
        totalCost -= sellQ * avgCost
        if (quantity < 0) quantity = 0
        if (totalCost < 0) totalCost = 0
      }
    }

    if (symbolSellCount > 0) {
      bySymbol.push({
        symbol,
        assetType,
        realizedPnl: roundMoney(symbolRealized),
      })
      totalRealizedPnl += symbolRealized
      sellCount += symbolSellCount
    }
  }

  bySymbol.sort((a, b) => Math.abs(b.realizedPnl) - Math.abs(a.realizedPnl))

  return {
    totalRealizedPnl: roundMoney(totalRealizedPnl),
    bySymbol,
    sellCount,
  }
}
