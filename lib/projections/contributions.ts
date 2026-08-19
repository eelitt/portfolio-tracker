import {
  convertBetweenCurrencies,
  type Currency,
} from '@/lib/currency'
import type { Transaction } from '@/lib/types'

export const INFLOW_WINDOW_DAYS = 90

export type InflowMonth = {
  key: string
  label: string
  amount: number
  buys: number
  cash: number
}

/** Auto cash credit from a sell — not a user deposit. */
export function isSellProceedsInflow(tx: Transaction): boolean {
  return /^Proceeds from SELL\b/i.test(String(tx.notes || '').trim())
}

export function isUserCashInflow(tx: Transaction): boolean {
  if (tx.asset_type !== 'cash' || tx.action !== 'inflow') return false
  return !isSellProceedsInflow(tx)
}

export function isAssetBuy(tx: Transaction): boolean {
  return tx.action === 'buy' && tx.asset_type !== 'cash'
}

export function isCapitalIn(
  tx: Transaction,
  includeCashInflows: boolean
): boolean {
  if (isAssetBuy(tx)) return true
  if (includeCashInflows && isUserCashInflow(tx)) return true
  return false
}

function monthKey(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`
}

function monthLabel(y: number, m: number): string {
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('fi-FI', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Calendar months that overlap [startMs, endMs] inclusive (UTC days). */
export function overlappingMonths(
  startMs: number,
  endMs: number
): InflowMonth[] {
  const start = new Date(startMs)
  const end = new Date(endMs)
  let y = start.getUTCFullYear()
  let m = start.getUTCMonth() + 1
  const ey = end.getUTCFullYear()
  const em = end.getUTCMonth() + 1
  const out: InflowMonth[] = []
  while (y < ey || (y === ey && m <= em)) {
    out.push({
      key: monthKey(y, m),
      label: monthLabel(y, m),
      amount: 0,
      buys: 0,
      cash: 0,
    })
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

export function monthDepositAmount(
  row: InflowMonth,
  includeCashInflows: boolean
): number {
  return row.buys + (includeCashInflows ? row.cash : 0)
}

/**
 * New capital in the last 90 days: asset buys + optional user cash inflows.
 * Average = window sum / 3. `months` always includes zeros.
 */
export function averageMonthlyUserInflows(
  transactions: Transaction[],
  preferredCurrency: Currency,
  usdToEurRate: number,
  now = new Date()
): {
  monthly: number
  monthlyBuys: number
  monthlyCash: number
  windowDays: number
  inflowCount: number
  months: InflowMonth[]
} {
  const end = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  )
  const start = end - INFLOW_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const months = overlappingMonths(start, end)
  const byKey = new Map(months.map((row) => [row.key, row]))
  let buySum = 0
  let cashSum = 0
  let inflowCount = 0
  for (const tx of transactions || []) {
    const isBuy = isAssetBuy(tx)
    const isCash = isUserCashInflow(tx)
    if (!isBuy && !isCash) continue
    const day = String(tx.executed_at || '').slice(0, 10)
    const t = Date.parse(`${day}T00:00:00Z`)
    if (!Number.isFinite(t) || t < start || t > end) continue
    const txCurr = (tx.currency || 'USD') as Currency
    const notional = convertBetweenCurrencies(
      Number(tx.quantity) * Number(tx.unit_price || 1),
      txCurr,
      preferredCurrency,
      usdToEurRate
    )
    if (!Number.isFinite(notional) || !(notional > 0)) continue
    inflowCount += 1
    const row = byKey.get(day.slice(0, 7))
    if (isBuy) {
      buySum += notional
      if (row) row.buys += notional
    } else {
      cashSum += notional
      if (row) row.cash += notional
    }
  }
  for (const row of months) {
    row.amount = row.buys + row.cash
  }
  return {
    monthly: (buySum + cashSum) / 3,
    monthlyBuys: buySum / 3,
    monthlyCash: cashSum / 3,
    windowDays: INFLOW_WINDOW_DAYS,
    inflowCount,
    months,
  }
}
