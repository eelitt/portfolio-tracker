/**
 * What-if scenario helpers (in-memory only — no DB writes).
 */

import type { EnrichedHolding } from '../types'
import type {
  PriceShock,
  PriceShockResult,
  ScenarioSnapshot,
  SellFractionInput,
  SellFractionResult,
} from './types'
import { allocationBreakdown } from './holdings'
import { portfolioTotals, roundMoney } from './shared'

function snapshotFromHoldings(holdings: EnrichedHolding[]): ScenarioSnapshot {
  const totals = portfolioTotals(holdings)
  const alloc = allocationBreakdown(holdings)
  return {
    ...totals,
    allocationBySymbol: alloc.bySymbol.slice(0, 10),
  }
}

/**
 * Hypothetical partial sell at current mark. Does not credit cash or write txs.
 */
export function simulateSellFraction(
  holdings: EnrichedHolding[],
  input: SellFractionInput
): SellFractionResult {
  const symbol = input.symbol.toUpperCase()
  const idx = holdings.findIndex((h) => h.symbol.toUpperCase() === symbol)
  if (idx < 0) {
    return { ok: false, error: `No open position found for ${symbol}.` }
  }

  const holding = holdings[idx]
  if (holding.asset_type === 'cash') {
    return { ok: false, error: 'Cannot simulate a market sell on a cash position.' }
  }
  if (!holding.priceAvailable || holding.currentPrice <= 0) {
    return {
      ok: false,
      error: `No live price available for ${symbol}; cannot simulate a sell.`,
    }
  }

  let soldQuantity: number
  if (input.quantity !== undefined && input.quantity !== null) {
    if (!(input.quantity > 0)) {
      return { ok: false, error: 'Sell quantity must be greater than 0.' }
    }
    soldQuantity = Math.min(input.quantity, holding.quantity)
  } else if (input.fraction !== undefined && input.fraction !== null) {
    if (input.fraction <= 0 || input.fraction > 1) {
      return { ok: false, error: 'Sell fraction must be in (0, 1].' }
    }
    soldQuantity = holding.quantity * input.fraction
  } else {
    return { ok: false, error: 'Provide either fraction or quantity to sell.' }
  }

  // Round like crypto precision
  soldQuantity = Number(soldQuantity.toFixed(8))
  if (soldQuantity <= 0) {
    return { ok: false, error: 'Sell quantity rounds to zero.' }
  }

  const sellPrice = holding.currentPrice
  const costBasis = soldQuantity * holding.avgCost
  const impliedRealized = roundMoney(soldQuantity * sellPrice - costBasis)

  const before = snapshotFromHoldings(holdings)

  const remainingQty = Number((holding.quantity - soldQuantity).toFixed(8))
  const next = holdings
    .map((h, i) => {
      if (i !== idx) return { ...h }
      if (remainingQty <= 0) {
        return null
      }
      const totalCost = remainingQty * h.avgCost
      const marketValue = remainingQty * h.currentPrice
      const unrealizedPnl = marketValue - totalCost
      return {
        ...h,
        quantity: remainingQty,
        totalCost,
        marketValue,
        unrealizedPnl,
        unrealizedPnlPercent: totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : 0,
        position24hChange: marketValue * (h.change24h / 100),
      }
    })
    .filter(Boolean) as EnrichedHolding[]

  const after = snapshotFromHoldings(next)

  return {
    ok: true,
    symbol: holding.symbol,
    soldQuantity,
    sellPrice: roundMoney(sellPrice),
    impliedRealized,
    before,
    after,
    notes: [
      'Hypothetical only — no transaction was written.',
      'Sale proceeds are not credited to cash in this simulation.',
      'Implied realized uses weighted average cost method.',
    ],
  }
}

/**
 * Re-mark selected positions by percent and recompute totals/allocation.
 */
export function simulatePriceShock(
  holdings: EnrichedHolding[],
  shocks: PriceShock[]
): PriceShockResult {
  if (!shocks?.length) {
    return { ok: false, error: 'Provide at least one price shock.' }
  }

  const shockMap = new Map<string, number>()
  for (const s of shocks) {
    shockMap.set(s.symbol.toUpperCase(), s.priceChangePercent)
  }

  const before = snapshotFromHoldings(holdings)
  const notes: string[] = [
    'Hypothetical only — live prices and database were not changed.',
  ]
  const applied: PriceShock[] = []
  let anyApplied = false

  const next = holdings.map((h) => {
    const pct = shockMap.get(h.symbol.toUpperCase())
    if (pct === undefined) return { ...h }

    if (h.asset_type === 'cash') {
      notes.push(`Skipped cash position ${h.symbol}.`)
      return { ...h }
    }
    if (!h.priceAvailable || h.currentPrice <= 0) {
      notes.push(`Skipped ${h.symbol}: no live price.`)
      return { ...h }
    }

    anyApplied = true
    applied.push({ symbol: h.symbol, priceChangePercent: pct })

    const currentPrice = h.currentPrice * (1 + pct / 100)
    const marketValue = h.quantity * currentPrice
    const unrealizedPnl = marketValue - h.totalCost
    return {
      ...h,
      currentPrice,
      marketValue,
      unrealizedPnl,
      unrealizedPnlPercent: h.totalCost > 0 ? (unrealizedPnl / h.totalCost) * 100 : 0,
      // 24h is no longer meaningful after a custom shock
      change24h: 0,
      position24hChange: 0,
    }
  })

  if (!anyApplied) {
    return {
      ok: false,
      error: 'No shocks could be applied (symbols missing, unpriced, or cash).',
    }
  }

  return {
    ok: true,
    shocksApplied: applied,
    before,
    after: snapshotFromHoldings(next),
    notes,
  }
}
