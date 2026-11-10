import { getSymbolsForType } from './symbols'
import { frozenFiatUsd, isStableCash } from './currency'
import { cashOutflowRefusal } from './convertToPreferred'
import {
  cashEventsInUsd,
  ledgerAfterSave,
  saveRowFromForm,
  type SaveRow,
} from './perpSave'
import { ledgerPerpRows, validatePerps, type PerpMark } from './perps'
import {
  transactionSchema,
  type CsvAiParse,
  type CsvParsedTransactions,
  type TransactionFormData,
} from './schemas'

/**
 * CSV preview rows and the save plan. The plan uses the cash refusal and validatePerps.
 * It does not invent a second cash total.
 */

const SKIP_WARNINGS = {
  liquidation: 'Skipped a liquidation row',
  inverse: 'Skipped an inverse contract',
  option: 'Skipped an option row',
  wallet_transfer: 'A wallet transfer was not imported as margin',
} as const

function catalogSymbol(symbol: string): string {
  const upper = symbol.trim().toUpperCase()
  if (!upper.endsWith('USDT')) return upper
  const base = upper.slice(0, -4)
  const known = getSymbolsForType('crypto').some(
    (entry) => entry.symbol.toUpperCase() === base
  )
  return known ? base : upper
}

function isNotional(amount: number, quantity: number, price: number): boolean {
  return Math.abs(amount - quantity * price) <= 0.01
}

/** Model output becomes preview rows. Notional and realized profit are not margin. */
export function normalizeCsvImport(input: CsvAiParse): CsvParsedTransactions {
  const warnings = [...(input.warnings ?? [])]
  const transactions: TransactionFormData[] = []

  for (const row of input.transactions) {
    if (row.skip) {
      const name = row.symbol.trim() ? ` (${row.symbol.trim().toUpperCase()})` : ''
      warnings.push(`${SKIP_WARNINGS[row.skip]}${name}.`)
      continue
    }

    const symbol = catalogSymbol(row.symbol)
    const future = row.asset_type === 'future'
    let amount = row.amount ?? null
    const quantity = row.quantity ?? null
    const unitPrice = row.unit_price ?? null
    if (
      future &&
      (row.action === 'buy' || row.action === 'sell') &&
      amount != null &&
      quantity != null &&
      quantity > 0 &&
      unitPrice != null &&
      unitPrice > 0 &&
      isNotional(amount, quantity, unitPrice)
    ) {
      amount = null
    }

    const fill: TransactionFormData = {
      symbol,
      asset_type: row.asset_type,
      action: row.action,
      quantity,
      unit_price: unitPrice,
      amount: future ? amount : null,
      position_side: future ? row.position_side ?? null : null,
      executed_at: row.executed_at,
      notes: row.notes ?? undefined,
      currency: future ? 'USD' : row.currency ?? undefined,
    }
    transactions.push(fill)

    if (
      future &&
      (row.action === 'buy' || row.action === 'sell') &&
      row.fee != null &&
      row.fee !== 0
    ) {
      transactions.push({
        symbol,
        asset_type: 'future',
        action: 'fee',
        quantity: null,
        unit_price: null,
        amount: row.fee < 0 ? row.fee : -Math.abs(row.fee),
        position_side: row.position_side ?? null,
        executed_at: row.executed_at,
        currency: 'USD',
      })
    }
  }

  return { transactions, warnings }
}

export type ImportSkip = {
  index: number
  symbol: string
  reason: string
}

export type ImportStep =
  | {
      ok: true
      index: number
      rows: Array<SaveRow & { notes?: string | null }>
    }
  | ({ ok: false } & ImportSkip)

function timeOf(value: string): number {
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY
}

function changesBook(data: TransactionFormData): boolean {
  return data.asset_type === 'future' || data.asset_type === 'cash' || data.action === 'sell'
}

function fieldErrors(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }): string {
  return Object.values(error.flatten().fieldErrors).flat().filter(Boolean).join(', ')
}

/**
 * Replay the batch in time order on top of the current rows.
 * A failing row is left out, so a later row that needed it fails too.
 * A future fill does not add an Available Cash proceeds row.
 */
export function planImport(input: {
  existing: readonly SaveRow[]
  incoming: readonly { row: TransactionFormData; index: number }[]
  usdToEurRate: number
  marks: Record<string, PerpMark>
  nowIso: string
  defaultCurrency: 'USD' | 'EUR'
  futureSymbolAllowed: (symbol: string) => boolean
}): { steps: ImportStep[] } {
  const ordered = [...input.incoming].sort((a, b) => {
    const ta = timeOf(a.row.executed_at)
    const tb = timeOf(b.row.executed_at)
    if (ta !== tb) return ta - tb
    const aFee = a.row.action === 'fee'
    const bFee = b.row.action === 'fee'
    const aFill = a.row.action === 'buy' || a.row.action === 'sell'
    const bFill = b.row.action === 'buy' || b.row.action === 'sell'
    if (aFee && bFill) return 1
    if (bFee && aFill) return -1
    return a.index - b.index
  })

  let book: SaveRow[] = [...input.existing]
  const steps: ImportStep[] = []

  for (const item of ordered) {
    const parsed = transactionSchema.safeParse(item.row)
    if (!parsed.success) {
      steps.push({
        ok: false,
        index: item.index,
        symbol: item.row.symbol || 'unknown',
        reason: fieldErrors(parsed.error) || 'Invalid transaction',
      })
      continue
    }

    const data =
      parsed.data.asset_type === 'cash' && parsed.data.quantity != null
        ? { ...parsed.data, quantity: Number(Number(parsed.data.quantity).toFixed(2)) }
        : parsed.data
    if (data.asset_type === 'future' && !input.futureSymbolAllowed(data.symbol)) {
      steps.push({
        ok: false,
        index: item.index,
        symbol: data.symbol,
        reason: 'Symbol is not in the crypto catalog',
      })
      continue
    }

    const chosen =
      data.asset_type === 'future' ? 'USD' : data.currency || input.defaultCurrency
    // Import stays on USD or EUR. USDT and USDC are not written from a CSV row.
    const currency: 'USD' | 'EUR' = chosen === 'EUR' ? 'EUR' : 'USD'
    const row = saveRowFromForm(data, currency, `import:${item.index}`)
    if (row.asset_type === 'cash' && !isStableCash(currency)) {
      row.amount = frozenFiatUsd(currency, row.quantity, row.unit_price, input.usdToEurRate)
    }
    const next = ledgerAfterSave(book, { kind: 'create', row }, input.nowIso)
    if (changesBook(data)) {
      const over = cashOutflowRefusal(next, input.usdToEurRate, {
        kind: 'create',
        id: row.id,
      })
      if (over) {
        steps.push({
          ok: false,
          index: item.index,
          symbol: data.symbol,
          reason: over,
        })
        continue
      }
      const verdict = validatePerps({
        rows: ledgerPerpRows(next),
        cash: cashEventsInUsd(next, input.usdToEurRate),
        marks: input.marks,
      })
      if (!verdict.ok) {
        steps.push({
          ok: false,
          index: item.index,
          symbol: data.symbol,
          reason: verdict.reason,
        })
        continue
      }
    }

    const added = next.slice(book.length)
    book = next
    steps.push({
      ok: true,
      index: item.index,
      rows: added.map((saved) => ({
        ...saved,
        notes:
          saved.asset_type === 'cash' && String(saved.id).startsWith('proceeds:')
            ? `Proceeds from SELL ${data.quantity} ${data.symbol} @ ${data.unit_price}`
            : data.notes ?? null,
      })),
    })
  }

  return { steps }
}
