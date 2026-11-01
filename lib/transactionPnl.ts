import type { Transaction } from './types'
import type { Currency } from './currency'
import { convertAmount, convertBetweenCurrencies } from './currency'
import { ledgerPerpRows, reducePerps } from './perps'

export type TransactionPnlKind = 'unrealized' | 'realized' | 'closed' | 'none'

export type TransactionPnlRow = {
  kind: TransactionPnlKind
  /** Preferred currency. Present for unrealized and realized. */
  amount?: number
  /** Omitted when the row's cost denominator is 0. */
  percent?: number
}

type Slice = {
  transactionId: string
  qty: number
  unitPrice: number
}

type Quote = { price: number }

function isCash(tx: Transaction): boolean {
  return tx.asset_type === 'cash'
}

function hasQuote(quote: Quote | undefined): quote is Quote {
  return !!quote && typeof quote.price === 'number' && Number.isFinite(quote.price) && quote.price > 0
}

function percentOf(amount: number, cost: number): number | undefined {
  if (!(cost > 0)) return undefined
  return (amount / cost) * 100
}

/**
 * Per-transaction operating P&L for the ledger table.
 * Same weighted-average pool as calculateHoldings, split onto each row.
 * Cash never enters a pool. Entry currency is the first row in the symbol.
 */
export function transactionPnl(input: {
  transactions: Transaction[]
  priceData: Record<string, Quote>
  preferredCurrency: Currency
  usdToEurRate: number
}): Map<string, TransactionPnlRow> {
  const result = new Map<string, TransactionPnlRow>()
  const grouped = new Map<string, Transaction[]>()

  const perpRows = ledgerPerpRows(input.transactions || [])
  const acceptedPerpIds = new Set(
    perpRows.map((row) => row.id).filter((id): id is string => !!id)
  )
  for (const tx of input.transactions || []) {
    if (tx.asset_type === 'future') {
      if (tx.id && !acceptedPerpIds.has(tx.id)) result.set(tx.id, { kind: 'none' })
      continue
    }
    if (isCash(tx)) {
      if (tx.id) result.set(tx.id, { kind: 'none' })
      continue
    }
    const list = grouped.get(tx.symbol)
    if (list) list.push(tx)
    else grouped.set(tx.symbol, [tx])
  }

  for (const [symbol, txs] of grouped) {
    const sorted = [...txs].sort(
      (a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime()
    )
    const entry = (sorted[0]?.currency || 'USD') as Currency
    const slices: Slice[] = []
    let quantity = 0
    let totalCost = 0

    for (const tx of sorted) {
      const qty = Number(tx.quantity)
      const unitPrice = Number(tx.unit_price)

      if (tx.action === 'buy' || tx.action === 'inflow') {
        slices.push({
          transactionId: tx.id ?? '',
          qty,
          unitPrice,
        })
        quantity += qty
        totalCost += qty * unitPrice
        continue
      }

      if (tx.action !== 'sell' && tx.action !== 'outflow') continue

      const q = quantity > 0 ? Math.min(qty, quantity) : 0
      if (q === 0) {
        if (tx.id) result.set(tx.id, { kind: 'none' })
        continue
      }

      const avgCost = totalCost / quantity
      const proceeds = q * unitPrice
      const removedCost = q * avgCost
      const proceedsPref = convertBetweenCurrencies(
        proceeds,
        entry,
        input.preferredCurrency,
        input.usdToEurRate
      )
      const removedPref = convertBetweenCurrencies(
        removedCost,
        entry,
        input.preferredCurrency,
        input.usdToEurRate
      )
      const amount = proceedsPref - removedPref
      const fraction = q / quantity
      for (const slice of slices) {
        slice.qty *= 1 - fraction
      }
      quantity -= q
      totalCost -= removedCost
      if (quantity < 0) quantity = 0
      if (totalCost < 0) totalCost = 0

      if (tx.id) {
        result.set(tx.id, {
          kind: 'realized',
          amount,
          percent: percentOf(amount, removedPref),
        })
      }
    }

    const quote = input.priceData[symbol]
    for (const slice of slices) {
      if (!slice.transactionId) continue
      const remaining = Number(slice.qty.toFixed(8))
      if (!(remaining > 0)) {
        result.set(slice.transactionId, { kind: 'closed' })
        continue
      }
      if (!hasQuote(quote)) {
        result.set(slice.transactionId, { kind: 'none' })
        continue
      }
      const costEntry = remaining * slice.unitPrice
      const costPref = convertBetweenCurrencies(
        costEntry,
        entry,
        input.preferredCurrency,
        input.usdToEurRate
      )
      const pricePref = convertAmount(quote.price, input.preferredCurrency, input.usdToEurRate)
      const amount = remaining * pricePref - costPref
      result.set(slice.transactionId, {
        kind: 'unrealized',
        amount,
        percent: percentOf(amount, costPref),
      })
    }
  }

  const book = reducePerps({ rows: perpRows })
  for (const [id, pnl] of book.rowPnl) {
    if (pnl.kind === 'none') {
      result.set(id, { kind: 'none' })
      continue
    }
    const amount = convertBetweenCurrencies(
      pnl.realized,
      'USD',
      input.preferredCurrency,
      input.usdToEurRate
    )
    const released = convertBetweenCurrencies(
      pnl.releasedMargin,
      'USD',
      input.preferredCurrency,
      input.usdToEurRate
    )
    result.set(id, {
      kind: 'realized',
      amount,
      percent: pnl.releasedMargin > 0 ? percentOf(amount, released) : undefined,
    })
  }

  return result
}
