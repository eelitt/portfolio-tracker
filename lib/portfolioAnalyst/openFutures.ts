/**
 * What the analyst may say about open futures and the cash total.
 * Numbers come from getPortfolioData. This file does not reduce the book.
 */

import type { EnrichedHolding } from '../types'
import type { PerpHeadlineTerm } from '../convertToPreferred'
import { roundMoney } from './shared'

/** Cash holdings already include the future cash effect. Do not sum cash rows here. */
export function cashTotal(holdings: EnrichedHolding[]): number {
  return roundMoney(
    holdings
      .filter((h) => h.asset_type === 'cash')
      .reduce((sum, h) => sum + h.marketValue, 0)
  )
}

/** Worth is equity. Notional is labeled and is not a portfolio total. */
export function compactOpenFutures(perps: PerpHeadlineTerm[]) {
  return perps.map((p) => ({
    symbol: p.symbol,
    side: p.positionSide,
    equity: roundMoney(p.equity),
    unrealizedPnl: p.unrealized == null ? null : roundMoney(p.unrealized),
    margin: roundMoney(p.margin),
    fundingNet: roundMoney(p.fundingNet),
    feeNet: roundMoney(p.feeNet),
    quantity: p.quantity,
    entry: roundMoney(p.entry),
    mark: p.mark == null ? null : roundMoney(p.mark),
    notional: p.notional == null ? null : roundMoney(p.notional),
    priced: p.priced,
  }))
}
