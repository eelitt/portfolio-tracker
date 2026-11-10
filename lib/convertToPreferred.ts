import type { Currency } from './currency'
import {
  convertAmount,
  convertBetweenCurrencies,
  isStableCash,
  ledgerFiatUsd,
} from './currency'
import {
  cashOutflowText,
  compareLedgerTime,
  ledgerPerpRows,
  quotePerp,
  reducePerps,
  scopeCashRefusal,
  type OpenPerp,
  type PerpMark,
} from './perps'
import type { CashParts, EnrichedHolding, PositionSide, Transaction } from './types'

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

type CashPoolRow = {
  id?: string
  symbol: string
  asset_type?: string
  action: string
  quantity?: number | null
  unit_price?: number | null
  executed_at: string
  created_at?: string | null
  currency?: string | null
  /** Frozen dollar value of a fiat row. Absent on older rows and on stables. */
  amount?: number | null
}

type PoolOver = {
  id?: string
  symbol: string
  currency: string
  executedAt: string
  created_at?: string | null
}

const POOL_EPS = 0.001

/**
 * One symbol's pools in USD. The fiat pool is the USD value of USD and EUR faces.
 * An outflow above its pool is reported, then capped. This is the only pool walk.
 */
function reduceSymbolPools(txs: readonly CashPoolRow[], usdToEurRate: number) {
  const sorted = [...txs].sort((a, b) => compareLedgerTime(a, b))
  let fiatUsd = 0
  let usdt = 0
  let usdc = 0
  let over: PoolOver | null = null

  for (const tx of sorted) {
    const raw = Number(tx.quantity) * Number(tx.unit_price)
    if (!Number.isFinite(raw)) continue
    const face = Number(raw.toFixed(2))
    const inflow = tx.action === 'buy' || tx.action === 'inflow'
    const outflow = tx.action === 'sell' || tx.action === 'outflow'
    if (!inflow && !outflow) continue

    if (isStableCash(tx.currency)) {
      const stable = tx.currency === 'USDC' ? 'USDC' : 'USDT'
      const pool = stable === 'USDC' ? usdc : usdt
      if (outflow && face > pool + POOL_EPS && !over) {
        over = {
          id: tx.id,
          symbol: tx.symbol,
          currency: stable,
          executedAt: tx.executed_at,
          created_at: tx.created_at,
        }
      }
      const next = inflow ? pool + face : Math.max(0, pool - Math.min(face, pool))
      if (stable === 'USDC') usdc = next
      else usdt = next
      continue
    }

    const usd = ledgerFiatUsd(face, tx.currency, usdToEurRate, tx.amount)
    if (!Number.isFinite(usd)) continue
    if (outflow && usd > fiatUsd + POOL_EPS && !over) {
      over = {
        id: tx.id,
        symbol: tx.symbol,
        currency: tx.currency || 'USD',
        executedAt: tx.executed_at,
        created_at: tx.created_at,
      }
    }
    if (inflow) fiatUsd += usd
    else if (fiatUsd > 0) fiatUsd = Math.max(0, fiatUsd - Math.min(usd, fiatUsd))
  }

  return { fiatUsd, usdt, usdc, over }
}

/**
 * Refusal for a ledger that contains an outflow larger than its pool at that time.
 * The reduce still caps a row that is already stored.
 */
export function cashOutflowRefusal(
  rows: readonly CashPoolRow[],
  usdToEurRate: number,
  change?: { kind: 'create' | 'update' | 'delete'; id?: string }
): string | null {
  const grouped = new Map<string, CashPoolRow[]>()
  for (const row of rows) {
    if (row.asset_type !== 'cash') continue
    const list = grouped.get(row.symbol)
    if (list) list.push(row)
    else grouped.set(row.symbol, [row])
  }
  let earliest: PoolOver | null = null
  for (const txs of grouped.values()) {
    const over = reduceSymbolPools(txs, usdToEurRate).over
    if (!over) continue
    if (
      !earliest ||
      compareLedgerTime(
        { executed_at: over.executedAt, created_at: over.created_at, id: over.id },
        {
          executed_at: earliest.executedAt,
          created_at: earliest.created_at,
          id: earliest.id,
        }
      ) < 0
    ) {
      earliest = over
    }
  }
  if (!earliest) return null
  const text = cashOutflowText({
    symbol: earliest.symbol,
    currency: earliest.currency,
    executedAt: earliest.executedAt,
    kind: 'pool',
  })
  if (!change) return text
  return scopeCashRefusal(text, change.kind, earliest.id, change.id)
}

/**
 * Build cash holdings in preferred currency.
 *
 * USD and EUR share one fiat pool: each face is converted, then netted.
 * USDT and USDC net in their own face at $1. An outflow spends only its pool.
 *
 * calculateHoldings cannot do this: it sums faces and stamps the first row's currency.
 *
 * Future rows are not cash transactions. Their net USD cash effect is converted
 * and applied to the Available Cash total. This does not insert an Available Cash row
 * and does not rewrite a stable face. The total stays when it is not positive.
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
    const pools = reduceSymbolPools(txs, usdToEurRate)
    const stableUsdt = Number(pools.usdt.toFixed(2))
    const stableUsdc = Number(pools.usdc.toFixed(2))
    const stablePreferred = Number(
      convertAmount(stableUsdt + stableUsdc, preferredCurrency, usdToEurRate).toFixed(2)
    )
    const fiatPreferred = Number(
      convertAmount(pools.fiatUsd, preferredCurrency, usdToEurRate).toFixed(2)
    )
    const finalQty = Number((fiatPreferred + stablePreferred).toFixed(2))
    if (finalQty > 0) {
      const stables: CashParts['stables'] = []
      if (stableUsdt > 0) stables.push({ currency: 'USDT', face: stableUsdt })
      if (stableUsdc > 0) stables.push({ currency: 'USDC', face: stableUsdc })
      holdings.push(
        cashHolding(
          symbol,
          finalQty,
          preferredCurrency,
          finalQty,
          0,
          stables.length > 0
            ? { fiatPreferred, stables, marginPreferred: 0 }
            : undefined
        )
      )
    }
  }

  return applyFutureCash(holdings, deltaPreferred, preferredCurrency)
}

function cashHolding(
  symbol: string,
  quantity: number,
  currency: Currency,
  weightValue: number,
  realizedPnl = 0,
  cashParts?: CashParts
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
    weightValue,
    ...(cashParts ? { cashParts } : {}),
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
    return [
      ...holdings,
      cashHolding(AVAILABLE_CASH, delta, preferredCurrency, 0, 0, {
        fiatPreferred: 0,
        stables: [],
        marginPreferred: delta,
      }),
    ]
  }

  const current = holdings[idx]
  const next = Number((current.quantity + delta).toFixed(2))
  const copy = [...holdings]
  const weight = current.weightValue ?? Math.max(0, current.quantity)
  copy[idx] = cashHolding(AVAILABLE_CASH, next, preferredCurrency, weight, current.realizedPnl, {
    fiatPreferred: current.cashParts ? current.cashParts.fiatPreferred : current.quantity,
    stables: current.cashParts?.stables ?? [],
    marginPreferred: delta,
  })
  return copy
}
