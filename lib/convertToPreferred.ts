import type { Currency } from './currency'
import { convertAmount, convertBetweenCurrencies } from './currency'
import type { EnrichedHolding, Transaction } from './types'

/**
 * Convert an enriched non-cash holding into the user's preferred display currency.
 *
 * Contract:
 * - Live market prices from enrichHoldings are always in USD.
 * - Cost basis / realized P&L are denominated in the holding's entry currency
 *   (from transactions at write time; legacy non-cash defaults to USD).
 * - Unrealized P&L and 24h impact are recomputed after conversion so we never
 *   scale mixed-currency P&L by the FX rate.
 */
export function toPreferredHolding(
  holding: EnrichedHolding,
  preferredCurrency: Currency,
  usdToEurRate: number
): EnrichedHolding {
  const entryCurr = (holding.currency || 'USD') as Currency

  // Market side: API quotes are USD
  const currentPrice = convertAmount(holding.currentPrice, preferredCurrency, usdToEurRate)
  const marketValue = holding.quantity * currentPrice

  // Cost side: entry currency → preferred
  const totalCost = convertBetweenCurrencies(
    holding.totalCost,
    entryCurr,
    preferredCurrency,
    usdToEurRate
  )
  const avgCost =
    holding.quantity > 0 ? totalCost / holding.quantity : 0
  const realizedPnl = convertBetweenCurrencies(
    holding.realizedPnl,
    entryCurr,
    preferredCurrency,
    usdToEurRate
  )

  const unrealizedPnl = marketValue - totalCost
  const unrealizedPnlPercent =
    totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : 0
  const position24hChange = marketValue * ((holding.change24h ?? 0) / 100)

  return {
    ...holding,
    currency: preferredCurrency,
    currentPrice,
    marketValue,
    totalCost,
    avgCost,
    realizedPnl,
    unrealizedPnl,
    unrealizedPnlPercent,
    position24hChange,
  }
}

/**
 * Build cash holdings in preferred currency by converting each cash transaction
 * with its own currency before netting.
 *
 * calculateHoldings cannot do this correctly: it sums face amounts across
 * currencies and stamps currency from the first chronological tx only.
 */
export function calculateCashHoldingsInPreferred(
  transactions: Transaction[],
  preferredCurrency: Currency,
  usdToEurRate: number
): EnrichedHolding[] {
  const cashTxs = (transactions || []).filter((tx) => tx.asset_type === 'cash')
  if (cashTxs.length === 0) return []

  const grouped = new Map<string, Transaction[]>()
  for (const tx of cashTxs) {
    if (!grouped.has(tx.symbol)) grouped.set(tx.symbol, [])
    grouped.get(tx.symbol)!.push(tx)
  }

  const holdings: EnrichedHolding[] = []

  for (const [symbol, txs] of grouped) {
    const sorted = [...txs].sort(
      (a, b) =>
        new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime()
    )

    // Balance in preferred currency (cash face amounts, unit price treated as 1 after convert)
    let quantity = 0
    let realizedPnl = 0

    for (const tx of sorted) {
      const txCurr = (tx.currency || 'USD') as Currency
      // Cash quantity is the face amount in tx currency; unit_price is normally 1.
      // Convert the notional so non-1 unit prices still work.
      const notional = convertBetweenCurrencies(
        Number(tx.quantity) * Number(tx.unit_price),
        txCurr,
        preferredCurrency,
        usdToEurRate
      )

      if (tx.action === 'buy' || tx.action === 'inflow') {
        quantity += notional
      } else if (tx.action === 'sell' || tx.action === 'outflow') {
        if (quantity > 0) {
          const sellQ = Math.min(notional, quantity)
          // Cash avg cost is 1 in display currency; realized ≈ 0 for pure face-value cash
          const avgCost = 1
          const sellValue = sellQ // unit price 1 in preferred
          const costBasis = sellQ * avgCost
          realizedPnl += sellValue - costBasis
          quantity -= sellQ
          if (quantity < 0) quantity = 0
        }
      }
    }

    const finalQty = Number(quantity.toFixed(2))
    if (finalQty > 0) {
      holdings.push({
        symbol,
        asset_type: 'cash',
        quantity: finalQty,
        avgCost: 1,
        totalCost: finalQty,
        realizedPnl: Number(realizedPnl.toFixed(2)),
        currency: preferredCurrency,
        currentPrice: 1,
        marketValue: finalQty,
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
        change24h: 0,
        position24hChange: 0,
      })
    }
  }

  return holdings
}
