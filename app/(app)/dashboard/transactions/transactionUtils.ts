import { Transaction } from '@/lib/types'
import { formatCurrency, getAmountInUsd } from '@/lib/currency'
import type { PreferredCurrency } from '@/lib/userTypes'

export type AugmentedTransaction = Transaction & { formattedDate?: string }

export interface FilterParams {
  searchTerm: string
  assetFilter: 'all' | Transaction['asset_type']
  actionFilter: 'all' | Transaction['action']
  dateFrom: string
  dateTo: string
}

export interface SortParams {
  sortColumn: 'date' | 'symbol' | 'quantity' | 'price'
  sortDirection: 'asc' | 'desc'
}

/**
 * Applies client-side search + asset/action type + date range filters.
 * All operations are pure.
 */
export function applyFilters(
  transactions: AugmentedTransaction[],
  params: FilterParams
): AugmentedTransaction[] {
  let result = [...transactions]

  // Search (symbol or notes)
  if (params.searchTerm.trim()) {
    const term = params.searchTerm.toLowerCase().trim()
    result = result.filter(tx =>
      tx.symbol.toLowerCase().includes(term) ||
      (tx.notes || '').toLowerCase().includes(term)
    )
  }

  // Asset type filter
  if (params.assetFilter !== 'all') {
    result = result.filter(tx => tx.asset_type === params.assetFilter)
  }

  // Action filter
  if (params.actionFilter !== 'all') {
    result = result.filter(tx => tx.action === params.actionFilter)
  }

  // Date range (string comparison works because executed_at is ISO and date inputs are YYYY-MM-DD)
  if (params.dateFrom) {
    result = result.filter(tx => tx.executed_at >= params.dateFrom)
  }
  if (params.dateTo) {
    result = result.filter(tx => tx.executed_at <= params.dateTo + 'T23:59:59')
  }

  return result
}

/**
 * Sorts the (already filtered) transactions.
 * Mutates a copy — safe to call on derived arrays.
 */
export function applySort(
  transactions: AugmentedTransaction[],
  params: SortParams
): AugmentedTransaction[] {
  const result = [...transactions]

  result.sort((a, b) => {
    let valA: string | number
    let valB: string | number

    if (params.sortColumn === 'date') {
      valA = new Date(a.executed_at).getTime()
      valB = new Date(b.executed_at).getTime()
    } else if (params.sortColumn === 'symbol') {
      valA = a.symbol.toLowerCase()
      valB = b.symbol.toLowerCase()
    } else if (params.sortColumn === 'quantity') {
      valA = a.quantity
      valB = b.quantity
    } else {
      // price
      valA = a.unit_price
      valB = b.unit_price
    }

    if (valA < valB) return params.sortDirection === 'asc' ? -1 : 1
    if (valA > valB) return params.sortDirection === 'asc' ? 1 : -1
    return 0
  })

  return result
}

/**
 * Formats the Quantity cell value.
 * For cash: shows the monetary amount (converted).
 * For assets: shows the raw quantity (caller decides precision).
 */
export function formatQuantityCell(
  tx: AugmentedTransaction,
  preferredCurrency: PreferredCurrency,
  usdToPreferredRate: number,
  usdToEurRate: number
): string | number {
  if (tx.asset_type === 'cash') {
    const txCurr = (tx.currency as PreferredCurrency) || 'USD'
    const trueEurRate = usdToEurRate || 0.92
    const usdEq = getAmountInUsd(tx.quantity, txCurr, trueEurRate)
    return formatCurrency(usdEq, preferredCurrency, usdToPreferredRate)
  }
  return tx.quantity
}

/**
 * Formats the Price cell value.
 * For cash: unit price is always 1 in its own currency.
 * For assets: converts the unit price.
 */
export function formatPriceCell(
  tx: AugmentedTransaction,
  preferredCurrency: PreferredCurrency,
  usdToPreferredRate: number,
  usdToEurRate: number
): string {
  if (tx.asset_type === 'cash') {
    return formatCurrency(tx.unit_price, preferredCurrency, 1)
  }
  const txCurr = (tx.currency as PreferredCurrency) || 'USD'
  const trueEurRate = usdToEurRate || 0.92
  const usdEq = getAmountInUsd(tx.unit_price, txCurr, trueEurRate)
  return formatCurrency(usdEq, preferredCurrency, usdToPreferredRate)
}

/**
 * Returns counts of inflows (buy + inflow) and outflows (sell + outflow)
 * for a given list. Used for the stats line.
 */
export function getInflowOutflowCounts(transactions: AugmentedTransaction[]) {
  const inflows = transactions.filter(
    t => t.action === 'buy' || t.action === 'inflow'
  ).length
  const outflows = transactions.filter(
    t => t.action === 'sell' || t.action === 'outflow'
  ).length
  return { inflows, outflows }
}
