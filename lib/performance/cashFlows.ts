import { convertBetweenCurrencies, type Currency } from '@/lib/currency'
import type { Transaction } from '@/lib/types'

export type CashFlow = { date: string; amount: number }

/**
 * External cash flows only (inflow / outflow). Buys/sells are internal.
 * Amounts converted to preferred currency the same way cash holdings are.
 */
export function cashFlowsFromTransactions(
  transactions: Transaction[],
  preferredCurrency: Currency,
  usdToEurRate: number
): CashFlow[] {
  const byDate = new Map<string, number>()
  for (const tx of transactions || []) {
    if (tx.asset_type !== 'cash') continue
    if (tx.action !== 'inflow' && tx.action !== 'outflow') continue
    const date = String(tx.executed_at || '').slice(0, 10)
    if (!date) continue
    const txCurr = (tx.currency || 'USD') as Currency
    const notional = convertBetweenCurrencies(
      Number(tx.quantity) * Number(tx.unit_price || 1),
      txCurr,
      preferredCurrency,
      usdToEurRate
    )
    if (!Number.isFinite(notional)) continue
    const signed = tx.action === 'inflow' ? notional : -notional
    byDate.set(date, (byDate.get(date) ?? 0) + signed)
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, amount]) => ({ date, amount }))
}

/** Sum of flows with date in (afterDate, throughDate]. */
export function netCashFlowInRange(
  flows: CashFlow[],
  afterDate: string,
  throughDate: string
): number {
  let s = 0
  for (const f of flows) {
    if (f.date > afterDate && f.date <= throughDate) s += f.amount
  }
  return s
}
