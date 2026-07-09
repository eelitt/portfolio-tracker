import type { AssetType, TransactionAction } from '@/lib/types'
import { createHash } from 'crypto'
import { Holding, EnrichedHolding } from './types'

export type Transaction = {
  id?: string
  symbol: string
  asset_type: AssetType
  action: TransactionAction
  quantity: number
  unit_price: number
  executed_at: string
  currency?: 'USD' | 'EUR'
}

/**
 * This module contains the core domain logic for the portfolio tracker.
 *
 * - calculateHoldings: Reduces a list of buy/sell/inflow/outflow transactions into current
 *   positions using the weighted average cost method.
 * - enrichHoldings: Combines calculated holdings with live price data to
 *   produce market values, unrealized P&L, and 24h change impact.
 *
 * All calculations are pure functions (easy to test) and defensive
 * (handle out-of-order txs, partial sells, crypto precision, etc.).
 */

/**
 * Calculates current holdings from a list of transactions.
 *
 * Uses the **weighted average cost** method:
 * - Buys increase quantity and add to the total cost basis.
 * - Sells reduce quantity using the *current* average cost at the time of sale.
 * - Realized P&L is recorded for every sell/outflow on assets (even if the position is not fully closed).
 * - Fully closed positions are dropped from the result.
 *
 * Transactions are sorted by date per symbol so the logic is order-independent
 * on the input array.
 *
 * Supports fractional quantities (crypto) and uses 8 decimal places for
 * precision on holdings.
 */
export function calculateHoldings(transactions: Transaction[]): Holding[] {
  // Normalize to numbers in case DB returns numeric columns as strings.
  const normalizedTxs = (transactions || []).map(tx => ({
    ...tx,
    quantity: Number(tx.quantity),
    unit_price: Number(tx.unit_price),
  }))

  // Group all transactions by symbol so we can calculate each position independently.
  const grouped = new Map<string, Transaction[]>()

  for (const tx of normalizedTxs) {
    if (!grouped.has(tx.symbol)) {
      grouped.set(tx.symbol, [])
    }
    grouped.get(tx.symbol)!.push(tx)
  }

  const holdings: Holding[] = []

  for (const [symbol, txs] of grouped) {
    // Sort chronologically. This makes the algorithm robust even if the
    // caller passes transactions in arbitrary order (e.g. from DB without ORDER BY).
    const sortedTxs = [...txs].sort(
      (a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime()
    )

    let quantity = 0
    let totalCost = 0
    let realizedPnl = 0

    for (const tx of sortedTxs) {
      if (tx.action === 'buy' || tx.action === 'inflow') {
        const cost = tx.quantity * tx.unit_price
        totalCost += cost
        quantity += tx.quantity
      } else if (tx.action === 'sell' || tx.action === 'outflow') {
        if (quantity > 0) {
          // Use the *current* average cost for this sell/outflow (weighted average method).
          // Only 'sell'/'outflow' up to what we currently hold (cap oversells).
          const sellQ = Math.min(tx.quantity, quantity)
          const avgCost = totalCost / quantity
          const sellValue = sellQ * tx.unit_price
          const costBasis = sellQ * avgCost

          realizedPnl += sellValue - costBasis

          quantity -= sellQ
          totalCost -= costBasis

          // Defensive clamps — we never want negative holdings in the result.
          if (quantity < 0) quantity = 0
          if (totalCost < 0) totalCost = 0
        }
      }
    }

    // Only emit a holding if the user still has a (rounded) position open.
    // We round to 8 decimals (crypto precision) and drop if that rounds to zero.
    // For cash we use 2 decimals (fiat precision).
    if (quantity > 0) {
      const firstTx = sortedTxs[0]
      const isCash = firstTx.asset_type === 'cash'
      const finalQty = isCash
        ? Number(quantity.toFixed(2))
        : Number(quantity.toFixed(8))
      if (finalQty > 0) {
        const finalCost = isCash
          ? Number(totalCost.toFixed(2))
          : Number(totalCost.toFixed(8))
        holdings.push({
          symbol,
          asset_type: firstTx.asset_type,
          quantity: finalQty,
          avgCost: isCash ? 1 : Number((finalCost / finalQty).toFixed(8)),
          totalCost: finalCost,
          realizedPnl: Number(realizedPnl.toFixed(2)),
          // Attach currency for all holdings so we know the denomination of unit prices / costs.
          // Legacy non-cash txs without currency default to USD.
          currency: firstTx.currency || 'USD',
        })
      }
    }
  }

  return holdings
}

/**
 * Takes calculated holdings and attaches live market data.
 *
 * For each holding we compute:
 * - currentPrice + marketValue
 * - unrealizedPnl (absolute and percentage)
 * - position24hChange = how much this position contributed to the portfolio's 24h move
 *
 * Missing price data is handled gracefully (price falls back to 0, percentages become 0 or -100%).
 * This allows the UI to still render holdings even when some tickers fail to price.
 */
export function enrichHoldings(
  holdings: Holding[],
  priceData: Record<string, { price: number; change24h: number | null }>
): EnrichedHolding[] {
  return holdings.map((holding) => {
    const raw = priceData[holding.symbol]
    // Guard against missing or malformed price data from the service.
    const data = raw && typeof raw === 'object'
      ? raw
      : { price: 0, change24h: null as number | null }

    const currentPrice = data.price ?? 0
    const marketValue = holding.quantity * currentPrice
    const unrealizedPnl = marketValue - holding.totalCost
    const unrealizedPnlPercent =
      holding.totalCost > 0 ? (unrealizedPnl / holding.totalCost) * 100 : 0

    const change24h = data.change24h ?? 0
    const position24hChange = marketValue * (change24h / 100)

    return {
      ...holding,
      currentPrice,
      marketValue,
      unrealizedPnl,
      unrealizedPnlPercent,
      change24h,
      position24hChange,
    }
  })
}

/**
 * Computes a stable hash of the portfolio based on its transactions.
 * Used to detect whether the underlying portfolio data has changed
 * since the last AI analysis (prices are ignored because they are volatile).
 *
 * The hash is based on a canonical serialization of the transactions
 * (sorted by executed_at + id, using the fields that affect holdings calculation).
 */
export function computePortfolioHash(transactions: Transaction[]): string {
  if (!transactions || transactions.length === 0) {
    return 'empty'
  }

  // Canonical sort for determinism (same as calculateHoldings does internally)
  const sorted = [...transactions].sort((a, b) => {
    const timeDiff = new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime()
    if (timeDiff !== 0) return timeDiff
    return (a.id || '').localeCompare(b.id || '')
  })

  const repr = sorted
    .map(t => `${t.id || ''}|${t.symbol}|${t.action}|${t.quantity.toFixed(8)}|${t.unit_price.toFixed(2)}|${t.executed_at}|${t.currency || ''}`)
    .join(';')

  return createHash('sha256').update(repr).digest('hex').slice(0, 16)
}