import { z } from 'zod'

// Minimal Transaction type for calculations
export const TransactionSchema = z.object({
  id: z.string().optional(),
  symbol: z.string(),
  asset_type: z.enum(['stock', 'crypto']),
  action: z.enum(['buy', 'sell']),
  quantity: z.number().positive(),
  unit_price: z.number().positive(),
  executed_at: z.string(),
})

export type Transaction = z.infer<typeof TransactionSchema>

export interface Holding {
  symbol: string
  asset_type: 'stock' | 'crypto'
  quantity: number
  avgCost: number
  totalCost: number
  realizedPnl: number
}

export function calculateHoldings(transactions: Transaction[]): Holding[] {
  // Group transactions by symbol
  const grouped = new Map<string, Transaction[]>()

  for (const tx of transactions) {
    if (!grouped.has(tx.symbol)) {
      grouped.set(tx.symbol, [])
    }
    grouped.get(tx.symbol)!.push(tx)
  }

  const holdings: Holding[] = []

  for (const [symbol, txs] of grouped) {
    // Sort by date to process in chronological order
    const sortedTxs = [...txs].sort(
      (a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime()
    )

    let quantity = 0
    let totalCost = 0
    let realizedPnl = 0

    for (const tx of sortedTxs) {
      if (tx.action === 'buy') {
        const cost = tx.quantity * tx.unit_price
        totalCost += cost
        quantity += tx.quantity
      } else if (tx.action === 'sell') {
        if (quantity > 0) {
          const avgCost = totalCost / quantity
          const sellValue = tx.quantity * tx.unit_price
          const costBasis = tx.quantity * avgCost

          realizedPnl += sellValue - costBasis

          quantity -= tx.quantity
          totalCost -= costBasis

          // Prevent negative quantity
          if (quantity < 0) quantity = 0
          if (totalCost < 0) totalCost = 0
        }
      }
    }

    if (quantity > 0) {
      holdings.push({
        symbol,
        asset_type: sortedTxs[0].asset_type,
        quantity: Number(quantity.toFixed(8)), // handle crypto precision
        avgCost: Number((totalCost / quantity).toFixed(8)),
        totalCost: Number(totalCost.toFixed(8)),
        realizedPnl: Number(realizedPnl.toFixed(2)),
      })
    }
  }

  return holdings
}