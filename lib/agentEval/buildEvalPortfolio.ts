/**
 * Build a PortfolioData snapshot from an eval fixture seed.
 *
 * Mirrors the dashboard pipeline (holdings → enrich → preferred currency)
 * without live price APIs or the user DB — so eval cases are deterministic.
 */

import { calculateHoldings, enrichHoldings } from '@/lib/calculatePortfolio'
import {
  aggregatePreferredPortfolio,
  calculateCashHoldingsInPreferred,
  perpQuoteInPreferred,
  toPreferredHolding,
} from '@/lib/convertToPreferred'
import { ledgerPerpRows, reducePerps, type PerpMark } from '@/lib/perps'
import type { PortfolioData } from '@/lib/portfolioData'
import type { Transaction } from '@/lib/types'
import type { PreferredCurrency } from '@/lib/userTypes'
import type { EvalCaseFixture } from '@/lib/agentObservability'

function marksFromSeedPrices(
  prices: EvalCaseFixture['seed']['prices']
): Record<string, PerpMark> {
  const marks: Record<string, PerpMark> = {}
  for (const [symbol, raw] of Object.entries(prices || {})) {
    const price = typeof raw === 'number' ? raw : raw.price
    if (price > 0) marks[symbol.toUpperCase()] = { mark: price }
  }
  return marks
}

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
    position_side: tx.position_side,
    amount: tx.amount,
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
  const marks = marksFromSeedPrices(seed.prices)
  const preferredCash = calculateCashHoldingsInPreferred(
    transactions,
    preferredCurrency,
    usdToEurRate,
    marks
  )

  for (const cash of preferredCash) {
    priceDataForEnrich[cash.symbol] = { price: 1, change24h: 0 }
  }

  const perpBook = reducePerps({ rows: ledgerPerpRows(transactions), marks })
  const openPerps = perpBook.positions.map((position) =>
    perpQuoteInPreferred(
      position,
      marks[position.symbol],
      preferredCurrency,
      usdToEurRate
    )
  )
  const totals = aggregatePreferredPortfolio(
    preferredAssets,
    preferredCash,
    openPerps
  )

  return {
    transactions,
    priceData: priceDataForEnrich,
    ...totals,
    preferredCurrency,
    usdToPreferredRate,
    usdToEurRate,
    openPerps,
    error: null,
  }
}
