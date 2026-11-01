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
  sortColumn: 'date' | 'symbol' | 'quantity' | 'price' | 'pnl'
  sortDirection: 'asc' | 'desc'
  /** Amount in preferred currency. Null and missing ids sort after every number. */
  pnlAmountById?: ReadonlyMap<string, number | null>
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
      historySymbolLabel(tx).toLowerCase().includes(term) ||
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
      valA = historySymbolLabel(a).toLowerCase()
      valB = historySymbolLabel(b).toLowerCase()
    } else if (params.sortColumn === 'quantity') {
      valA = a.quantity ?? 0
      valB = b.quantity ?? 0
    } else if (params.sortColumn === 'pnl') {
      const rank = (tx: AugmentedTransaction) => {
        const amount = params.pnlAmountById?.get(tx.id ?? '')
        if (amount === undefined || amount === null || Number.isNaN(amount)) {
          return { blank: true as const, amount: 0 }
        }
        return { blank: false as const, amount }
      }
      const ra = rank(a)
      const rb = rank(b)
      if (ra.blank !== rb.blank) return ra.blank ? 1 : -1
      valA = ra.amount
      valB = rb.amount
    } else {
      valA = a.unit_price ?? 0
      valB = b.unit_price ?? 0
    }

    if (valA < valB) return params.sortDirection === 'asc' ? -1 : 1
    if (valA > valB) return params.sortDirection === 'asc' ? 1 : -1
    return 0
  })

  return result
}

const WALLET_ACTIONS = new Set<Transaction['action']>([
  'funding',
  'fee',
  'margin_add',
  'margin_remove',
])

const ACTION_LABELS: Record<Transaction['action'], string> = {
  buy: 'Buy',
  sell: 'Sell',
  inflow: 'Inflow',
  outflow: 'Outflow',
  funding: 'Funding',
  fee: 'Fee',
  margin_add: 'Add margin',
  margin_remove: 'Remove margin',
}

function isWalletAction(action: Transaction['action']): boolean {
  return WALLET_ACTIONS.has(action)
}

/** Symbol cell. A future row includes the side, such as "BTC long". */
export function historySymbolLabel(tx: Pick<AugmentedTransaction, 'symbol' | 'asset_type' | 'position_side'>): string {
  if (tx.asset_type === 'future' && (tx.position_side === 'long' || tx.position_side === 'short')) {
    return `${tx.symbol} ${tx.position_side}`
  }
  return tx.symbol
}

export function historyActionLabel(action: Transaction['action']): string {
  return ACTION_LABELS[action] ?? action
}

/**
 * Formats the Quantity cell value.
 * For cash: shows the monetary amount (converted).
 * For a future funding, fee, or margin row: blank. The amount is the price cell.
 * For assets: shows the raw quantity (caller decides precision).
 */
export function formatQuantityCell(
  tx: AugmentedTransaction,
  preferredCurrency: PreferredCurrency,
  usdToPreferredRate: number,
  usdToEurRate: number
): string | number {
  if (tx.asset_type === 'future' && isWalletAction(tx.action)) return ''
  if (tx.asset_type === 'cash') {
    const txCurr = (tx.currency as PreferredCurrency) || 'USD'
    const trueEurRate = usdToEurRate || 0.92
    const usdEq = getAmountInUsd(tx.quantity ?? 0, txCurr, trueEurRate)
    return formatCurrency(usdEq, preferredCurrency, usdToPreferredRate)
  }
  return tx.quantity ?? 0
}

/**
 * Formats the Price cell value.
 * For a future funding, fee, or margin row: the USD amount, converted to the preferred currency.
 * For cash: unit price is always 1 in its own currency.
 * For assets: converts the unit price.
 */
export function formatPriceCell(
  tx: AugmentedTransaction,
  preferredCurrency: PreferredCurrency,
  usdToPreferredRate: number,
  usdToEurRate: number
): string {
  if (tx.asset_type === 'future' && isWalletAction(tx.action)) {
    if (tx.amount == null || !Number.isFinite(tx.amount)) return ''
    return formatCurrency(tx.amount, preferredCurrency, usdToPreferredRate)
  }
  if (tx.asset_type === 'cash') {
    return formatCurrency(tx.unit_price ?? 0, preferredCurrency, 1)
  }
  const txCurr = (tx.currency as PreferredCurrency) || 'USD'
  const trueEurRate = usdToEurRate || 0.92
  const usdEq = getAmountInUsd(tx.unit_price ?? 0, txCurr, trueEurRate)
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
