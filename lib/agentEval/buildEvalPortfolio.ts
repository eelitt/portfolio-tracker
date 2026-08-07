/**
 * Build a PortfolioData snapshot from an eval fixture seed.
 *
 * Mirrors the dashboard pipeline (holdings → enrich → preferred currency)
 * without live price APIs or the user DB — so eval cases are deterministic.
 */

import { calculateHoldings, enrichHoldings } from '@/lib/calculatePortfolio'
import {
  calculateCashHoldingsInPreferred,
  toPreferredHolding,
} from '@/lib/convertToPreferred'
import type { PortfolioData } from '@/lib/portfolioData'
import type { Transaction } from '@/lib/types'
import type { PreferredCurrency } from '@/lib/userTypes'
import type { EvalCaseFixture } from '@/lib/agentObservability'

export function buildEvalPortfolioData(
  seed: EvalCaseFixture['seed']
): PortfolioData {
  const preferredCurrency: PreferredCurrency = seed.preferredCurrency ?? 'USD'
  const usdToEurRate = seed.usdToEurRate ?? 0.92
  const usdToPreferredRate = preferredCurrency === 'EUR' ? usdToEurRate : 1

  const transactions: Transaction[] = (seed.transactions || []).map((tx, i) => ({
    id: `eval-tx-${i}`,
    symbol: tx.symbol,
    asset_type: tx.asset_type,
    action: tx.action,
    quantity: tx.quantity,
    unit_price: tx.unit_price,
    executed_at: tx.executed_at,
    currency: tx.currency,
    notes: tx.notes,
  }))

  const allHoldings = calculateHoldings(transactions)
  const assetHoldings = allHoldings.filter((h) => h.asset_type !== 'cash')

  const priceData: Record<string, { price: number; change24h: number | null }> =
    {}
  for (const [symbol, raw] of Object.entries(seed.prices || {})) {
    if (typeof raw === 'number') {
      priceData[symbol.toUpperCase()] = { price: raw, change24h: 0 }
    } else {
      priceData[symbol.toUpperCase()] = {
        price: raw.price,
        change24h: raw.change24h ?? 0,
      }
    }
  }

  // enrichHoldings keys by holding.symbol — align seed price map to that case
  const priceDataForEnrich: typeof priceData = {}
  for (const h of assetHoldings) {
    const p =
      priceData[h.symbol.toUpperCase()] ?? priceData[h.symbol] ?? null
    if (p) priceDataForEnrich[h.symbol] = p
  }

  const enrichedAssets = enrichHoldings(assetHoldings, priceDataForEnrich)
  const preferredAssets = enrichedAssets.map((h) =>
    toPreferredHolding(h, preferredCurrency, usdToEurRate)
  )
  const preferredCash = calculateCashHoldingsInPreferred(
    transactions,
    preferredCurrency,
    usdToEurRate
  )

  for (const cash of preferredCash) {
    priceDataForEnrich[cash.symbol] = { price: 1, change24h: 0 }
  }

  const enrichedHoldings = [...preferredAssets, ...preferredCash]
  const unpricedSymbols = preferredAssets
    .filter((h) => !h.priceAvailable)
    .map((h) => h.symbol)
  const pricedAssets = preferredAssets.filter((h) => h.priceAvailable)

  const totalMarketValue =
    pricedAssets.reduce((sum, h) => sum + h.marketValue, 0) +
    preferredCash.reduce((sum, h) => sum + h.marketValue, 0)
  const totalCost = enrichedHoldings.reduce((sum, h) => sum + h.totalCost, 0)
  const totalUnrealizedPnl = pricedAssets.reduce(
    (sum, h) => sum + h.unrealizedPnl,
    0
  )
  const total24hChange = pricedAssets.reduce(
    (sum, h) => sum + h.position24hChange,
    0
  )
  const previousTotalValue = totalMarketValue - total24hChange
  const total24hChangePercent =
    previousTotalValue !== 0 ? (total24hChange / previousTotalValue) * 100 : 0

  return {
    transactions,
    enrichedHoldings,
    priceData: priceDataForEnrich,
    holdingsCount: enrichedHoldings.length,
    assetCount: preferredAssets.length,
    pricedAssetCount: pricedAssets.length,
    unpricedSymbols,
    totalMarketValue,
    totalCost,
    totalUnrealizedPnl,
    total24hChange,
    total24hChangePercent,
    preferredCurrency,
    usdToPreferredRate,
    usdToEurRate,
    error: null,
  }
}
