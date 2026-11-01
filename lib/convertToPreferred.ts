import type { Currency } from './currency'
import { convertAmount, convertBetweenCurrencies } from './currency'
import {
  ledgerPerpRows,
  quotePerp,
  reducePerps,
  type OpenPerp,
  type PerpMark,
} from './perps'
import type { EnrichedHolding, PositionSide, Transaction } from './types'

/** Open perp, already in the preferred currency, for the portfolio total and the card. */
export type PerpHeadlineTerm = {
  symbol: string
  positionSide: PositionSide
  valueAdd: number
  unrealizedAdd: number
  dayAdd: number
  priced: boolean
  margin: number
  fundingNet: number
  feeNet: number
  /** Null when the mark is missing. The headline adds nothing in that case. */
  unrealized: number | null
  equity: number
  /** Null when assigned margin is 0. Dimensionless. */
  leverage: number | null
  /** Null when the mark is missing or leverage cannot be computed. */
  availableMargin: number | null
  quantity: number
  entry: number
  mark: number | null
  notional: number | null
  /** Null when the mark or the mark 24 hours earlier is missing. */
  dayChange: number | null
}

/** Unrealized divided by the margin balance. Omitted when that balance is not positive. */
export function perpUnrealizedPercent(
  unrealized: number | null,
  margin: number
): number | undefined {
  if (unrealized == null || !(margin > 0)) return undefined
  return (unrealized / margin) * 100
}

const AVAILABLE_CASH = 'Available Cash'

/** Totals computed from preferred-currency assets + cash (no I/O). */
export type PreferredPortfolioAggregates = {
  enrichedHoldings: EnrichedHolding[]
  unpricedSymbols: string[]
  pricedAssetCount: number
  assetCount: number
  holdingsCount: number
  totalMarketValue: number
  totalCost: number
  totalUnrealizedPnl: number
  total24hChange: number
  total24hChangePercent: number
}

/**
 * Market value and 24h change include priced assets + cash only.
 * Cost basis includes unpriced assets. Unrealized P&L is priced-only
 * so a missing quote is not treated as $0.
 */
export function aggregatePreferredPortfolio(
  preferredAssets: EnrichedHolding[],
  preferredCash: EnrichedHolding[],
  perps: PerpHeadlineTerm[] = []
): PreferredPortfolioAggregates {
  const enrichedHoldings = [...preferredAssets, ...preferredCash]
  const unpricedSymbols = preferredAssets
    .filter((h) => !h.priceAvailable)
    .map((h) => h.symbol)
  const pricedAssets = preferredAssets.filter((h) => h.priceAvailable)

  let perpValue = 0
  let perpUnrealized = 0
  let perpDay = 0
  let pricedPerps = 0
  for (const perp of perps) {
    perpValue += perp.valueAdd
    perpUnrealized += perp.unrealizedAdd
    perpDay += perp.dayAdd
    if (perp.priced) pricedPerps += 1
    else unpricedSymbols.push(`${perp.symbol} ${perp.positionSide}`)
  }

  const totalMarketValue =
    pricedAssets.reduce((sum, h) => sum + h.marketValue, 0) +
    preferredCash.reduce((sum, h) => sum + h.marketValue, 0) +
    perpValue

  const totalCost = enrichedHoldings.reduce((sum, h) => sum + h.totalCost, 0)
  const totalUnrealizedPnl =
    pricedAssets.reduce((sum, h) => sum + h.unrealizedPnl, 0) + perpUnrealized
  const total24hChange =
    pricedAssets.reduce((sum, h) => sum + h.position24hChange, 0) + perpDay
  const previousTotalValue = totalMarketValue - total24hChange
  const total24hChangePercent =
    previousTotalValue > 0 ? (total24hChange / previousTotalValue) * 100 : 0

  return {
    enrichedHoldings,
    unpricedSymbols,
    pricedAssetCount: pricedAssets.length + pricedPerps,
    assetCount: preferredAssets.length + perps.length,
    holdingsCount: enrichedHoldings.length,
    totalMarketValue,
    totalCost,
    totalUnrealizedPnl,
    total24hChange,
    total24hChangePercent,
  }
}

function positiveMark(mark: number | null | undefined): number | null {
  return typeof mark === 'number' && Number.isFinite(mark) && mark > 0 ? mark : null
}

/**
 * Convert a USD perp quote into preferred currency.
 * Margin, funding, fees, unrealized P&L, and both marks convert first.
 * Equity and the 24h term are recomputed from those parts.
 */
export function perpQuoteInPreferred(
  position: OpenPerp,
  mark: PerpMark | undefined,
  preferredCurrency: Currency,
  usdToEurRate: number
): PerpHeadlineTerm {
  const quote = quotePerp(position, mark)
  const toPref = (amount: number) =>
    convertAmount(amount, preferredCurrency, usdToEurRate)
  const margin = toPref(position.margin)
  const funding = toPref(position.fundingNet)
  const fees = toPref(position.feeNet)
  const live = positiveMark(mark?.mark)
  const previous = positiveMark(mark?.previousMark)
  const side = position.positionSide === 'long' ? 1 : -1

  const entry = toPref(position.entry)
  const shared = {
    symbol: position.symbol,
    positionSide: position.positionSide,
    margin,
    fundingNet: funding,
    feeNet: fees,
    leverage: quote.leverage,
    quantity: position.quantity,
    entry,
  }

  if (live == null) {
    const equity = margin + funding + fees
    return {
      ...shared,
      valueAdd: equity,
      unrealizedAdd: 0,
      dayAdd: 0,
      priced: false,
      unrealized: null,
      equity,
      availableMargin: null,
      mark: null,
      notional: null,
      dayChange: null,
    }
  }

  const unrealized = toPref(quote.unrealized ?? 0)
  const markPref = toPref(live)
  const dayChange =
    previous == null
      ? null
      : (markPref - toPref(previous)) * position.quantity * side
  const equity = margin + funding + fees + unrealized
  const required =
    quote.requiredMargin == null ? null : toPref(quote.requiredMargin)

  return {
    ...shared,
    valueAdd: equity,
    unrealizedAdd: unrealized,
    dayAdd: dayChange ?? 0,
    priced: true,
    unrealized,
    equity,
    availableMargin: required == null ? null : equity - required,
    mark: markPref,
    notional: position.quantity * markPref,
    dayChange,
  }
}

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

  // Cost side always converts (from entry currency)
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

  // No valid live quote: keep market fields empty; still convert cost basis.
  if (holding.priceAvailable === false) {
    return {
      ...holding,
      currency: preferredCurrency,
      currentPrice: 0,
      marketValue: 0,
      totalCost,
      avgCost,
      realizedPnl,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      position24hChange: 0,
      priceAvailable: false,
    }
  }

  // Market side: API quotes are USD
  const currentPrice = convertAmount(holding.currentPrice, preferredCurrency, usdToEurRate)
  const marketValue = holding.quantity * currentPrice
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
    priceAvailable: true,
  }
}

/**
 * Build cash holdings in preferred currency by converting each cash transaction
 * with its own currency before netting.
 *
 * calculateHoldings cannot do this correctly: it sums face amounts across
 * currencies and stamps currency from the first chronological tx only.
 *
 * Future rows are not cash transactions. Their net USD cash effect is converted
 * and applied to Available Cash. This does not insert an Available Cash row.
 */
export function calculateCashHoldingsInPreferred(
  transactions: Transaction[],
  preferredCurrency: Currency,
  usdToEurRate: number,
  marks?: Record<string, PerpMark>
): EnrichedHolding[] {
  const cashTxs = (transactions || []).filter((tx) => tx.asset_type === 'cash')
  const futureCashDelta = reducePerps({
    rows: ledgerPerpRows(transactions || []),
    marks,
  }).futureCashDelta
  const deltaPreferred = convertAmount(
    futureCashDelta,
    preferredCurrency,
    usdToEurRate
  )
  if (cashTxs.length === 0) {
    return applyFutureCash([], deltaPreferred, preferredCurrency)
  }

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
        priceAvailable: true,
      })
    }
  }

  return applyFutureCash(holdings, deltaPreferred, preferredCurrency)
}

function cashHolding(
  symbol: string,
  quantity: number,
  currency: Currency,
  realizedPnl = 0
): EnrichedHolding {
  return {
    symbol,
    asset_type: 'cash',
    quantity,
    avgCost: 1,
    totalCost: quantity,
    realizedPnl,
    currency,
    currentPrice: 1,
    marketValue: quantity,
    unrealizedPnl: 0,
    unrealizedPnlPercent: 0,
    change24h: 0,
    position24hChange: 0,
    priceAvailable: true,
  }
}

function applyFutureCash(
  holdings: EnrichedHolding[],
  deltaPreferred: number,
  preferredCurrency: Currency
): EnrichedHolding[] {
  const delta = Number(deltaPreferred.toFixed(2))
  if (delta === 0) return holdings

  const idx = holdings.findIndex((h) => h.symbol === AVAILABLE_CASH)
  if (idx === -1) {
    if (!(delta > 0)) return holdings
    return [...holdings, cashHolding(AVAILABLE_CASH, delta, preferredCurrency)]
  }

  const current = holdings[idx]
  const next = Number((current.quantity + delta).toFixed(2))
  if (!(next > 0)) return holdings.filter((_, i) => i !== idx)
  const copy = [...holdings]
  copy[idx] = cashHolding(AVAILABLE_CASH, next, preferredCurrency, current.realizedPnl)
  return copy
}
