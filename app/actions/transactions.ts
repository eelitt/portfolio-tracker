'use server'

/**
 * Server Actions for transaction CRUD.
 *
 * All actions enforce that the authenticated user owns the data
 * (using Supabase RLS is the ultimate guarantee, but we also do
 * explicit user_id checks here for defense in depth).
 *
 * After every mutation we call revalidatePath('/dashboard') so that
 * the Server Components re-fetch fresh data on the next navigation/render.
 */

import { createClient } from '@/lib/supabase/server'
import { transactionSchema, type TransactionFormData } from '@/lib/schemas'
import { revalidatePath } from 'next/cache'
import { getCurrentUser, getCurrentUserProfile } from '@/lib/user'
import { getPortfolioData } from '@/lib/portfolioData'
import { frozenFiatUsd, getUsdToEurRate, isCashDenomination, isStableCash, type CashDenomination } from '@/lib/currency'
import { getUsdMMarks } from '@/lib/prices/binanceUsdM'
import { cashOutflowRefusal } from '@/lib/convertToPreferred'
import { ledgerPerpRows, scopeCashRefusal, validatePerps } from '@/lib/perps'
import {
  cashEventsInUsd,
  ledgerAfterSave,
  saveRowFromForm,
  type SaveChange,
  type SaveRow,
} from '@/lib/perpSave'
import { planImport } from '@/lib/csvImport'
import { getSymbolsForType } from '@/lib/symbols'

/** Shape returned by mutation actions to the client (used with useActionState). */
export type ActionState = {
  error?: string | Record<string, string[]>
  success?: boolean
}

export type CreateTransactionResult =
  | { ok: true; data: TransactionFormData & { currency: CashDenomination } }
  | { ok: false; error: string }

const SAVE_ROW_COLUMNS =
  'id, symbol, asset_type, action, position_side, quantity, unit_price, amount, executed_at, created_at, currency'

function futureSymbolAllowed(symbol: string): boolean {
  const upper = symbol.trim().toUpperCase()
  return getSymbolsForType('crypto').some((entry) => entry.symbol.toUpperCase() === upper)
}

/** Replay the book that would remain. A reject writes nothing. */
async function perpSaveError(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  change: SaveChange
): Promise<string | null> {
  const { data, error } = await supabase
    .from('transactions')
    .select(SAVE_ROW_COLUMNS)
    .eq('user_id', userId)
  if (error) return error.message

  const nowIso = new Date().toISOString()
  const ledger = ledgerAfterSave((data || []) as SaveRow[], change, nowIso)
  const rows = ledgerPerpRows(ledger)
  const hasCash = ledger.some((row) => row.asset_type === 'cash')
  if (rows.length === 0 && !hasCash) return null

  const symbols = [...new Set(rows.map((row) => row.symbol))]
  const [usdToEurRate, marks] = await Promise.all([
    getUsdToEurRate(),
    getUsdMMarks(symbols),
  ])
  const editedId = change.kind === 'create' ? 'new' : change.id
  const over = cashOutflowRefusal(ledger, usdToEurRate, { kind: change.kind, id: editedId })
  if (over) return over
  if (rows.length === 0) return null
  const saved = validatePerps({
    rows,
    cash: cashEventsInUsd(ledger, usdToEurRate),
    marks,
  })
  if (!saved.ok) {
    if (saved.reason.includes('outflow')) {
      return scopeCashRefusal(saved.reason, change.kind, saved.rowId, editedId)
    }
    return saved.reason
  }
  return null
}

function creditsSpotProceeds(data: { action: string; asset_type: string }): boolean {
  return data.action === 'sell' && data.asset_type !== 'cash' && data.asset_type !== 'future'
}

function formRaw(formData: FormData) {
  return {
    symbol: formData.get('symbol'),
    asset_type: formData.get('asset_type'),
    action: formData.get('action'),
    quantity: formData.get('quantity'),
    unit_price: formData.get('unit_price'),
    amount: formData.get('amount'),
    position_side: formData.get('position_side'),
    executed_at: formData.get('executed_at'),
    notes: formData.get('notes'),
    currency: formData.get('currency') || undefined,
  }
}

/**
 * Programmatic create (manual form, NL confirm, imports share this path after Zod).
 * @param options.requireCurrency — if true, currency must be set on the payload (NL path).
 *   If false (default), falls back to preferred currency like the manual form.
 */
export async function createTransactionRecord(
  raw: TransactionFormData,
  options: { requireCurrency?: boolean } = {}
): Promise<CreateTransactionResult> {
  const result = transactionSchema.safeParse(raw)
  if (!result.success) {
    const msg = Object.values(result.error.flatten().fieldErrors)
      .flat()
      .join(', ')
    return { ok: false, error: msg || 'Invalid transaction' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: 'Not authenticated' }
  }

  let currency: CashDenomination | undefined = isCashDenomination(result.data.currency)
    ? result.data.currency
    : undefined
  if (result.data.asset_type === 'future') {
    currency = 'USD'
    if (!futureSymbolAllowed(result.data.symbol)) {
      return { ok: false, error: 'Symbol is not in the crypto catalog' }
    }
  } else if (!currency) {
    if (options.requireCurrency) {
      return {
        ok: false,
        error:
          'Currency is required. Include € or $ (or USD/EUR) in your message before confirming.',
      }
    }
    const profile = await getCurrentUserProfile()
    currency = profile?.preferredCurrency || 'USD'
  }

  let quantity = result.data.quantity
  if (result.data.asset_type === 'cash' && quantity != null) {
    quantity = Number(Number(quantity).toFixed(2))
  }

  const row = saveRowFromForm(
    { ...result.data, quantity },
    currency as CashDenomination
  )
  if (row.asset_type === 'cash' && !isStableCash(currency)) {
    row.amount = frozenFiatUsd(currency, row.quantity, row.unit_price, await getUsdToEurRate())
  }
  const bookError = await perpSaveError(supabase, user.id, { kind: 'create', row })
  if (bookError) return { ok: false, error: bookError }

  const insertRow = { ...row }
  delete insertRow.id
  delete insertRow.created_at
  const { error } = await supabase.from('transactions').insert({
    ...insertRow,
    notes: result.data.notes ?? null,
    user_id: user.id,
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  // Auto credit sale proceeds to Available Cash. A future sell does not.
  if (creditsSpotProceeds(result.data) && result.data.quantity != null && result.data.unit_price != null) {
    const proceeds = Number(result.data.quantity) * Number(result.data.unit_price)
    if (proceeds > 0) {
      const sellCurrency = row.currency || 'USD'
      const cashInsert = {
        symbol: 'Available Cash',
        asset_type: 'cash' as const,
        action: 'inflow' as const,
        quantity: Number(proceeds.toFixed(2)),
        unit_price: 1,
        executed_at: result.data.executed_at,
        notes: `Proceeds from SELL ${result.data.quantity} ${result.data.symbol} @ ${result.data.unit_price}`,
        currency: sellCurrency,
        amount: frozenFiatUsd(sellCurrency, proceeds, 1, await getUsdToEurRate()),
        user_id: user.id,
      }
      const { error: cashError } = await supabase.from('transactions').insert(cashInsert)
      if (cashError) {
        console.error('Auto cash credit for sell proceeds failed:', cashError.message)
      }
    }
  }

  revalidatePath('/dashboard')
  return {
    ok: true,
    data: {
      ...result.data,
      currency: row.currency as CashDenomination,
    },
  }
}

/**
 * Creates a new transaction for the currently authenticated user (form / useActionState).
 * Validates input with Zod before touching the database.
 */
export async function createTransaction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const rawData = formRaw(formData)

  const result = transactionSchema.safeParse(rawData)
  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
    }
  }

  const created = await createTransactionRecord(result.data)
  if (!created.ok) {
    return { error: created.error }
  }
  return { success: true }
}

/**
 * Deletes a transaction after verifying the current user owns it.
 */
export async function deleteTransaction(transactionId: string) {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }
  // verify ownership (defense-in-depth in addition to Supabase RLS)
  const { data: transaction } = await supabase
    .from('transactions')
    .select('user_id')
    .eq('id', transactionId)
    .single()

    if (!transaction || transaction.user_id !== user.id) {
    return { error: 'Unauthorized' }
  }

  const bookError = await perpSaveError(supabase, user.id, {
    kind: 'delete',
    id: transactionId,
  })
  if (bookError) return { error: bookError }

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', transactionId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

/**
 * Updates an existing transaction.
 * Re-validates the entire payload with the same schema used for creates.
 * Ownership is verified before the update.
 */
export async function updateTransaction(
  transactionId: string,
  formData: FormData
) {
  const supabase = await createClient()
 const user = await getCurrentUser()
 
  if (!user) {
    return { error: 'Not authenticated' }
  }

  // verify ownership (defense-in-depth in addition to Supabase RLS)
  const { data: transaction } = await supabase
    .from('transactions')
    .select('user_id, asset_type, currency, created_at, quantity, unit_price, amount')
    .eq('id', transactionId)
    .single()

    if (!transaction || transaction.user_id !== user.id) {
    return { error: 'Unauthorized' }
  }

  const rawData = formRaw(formData)

  // Reuse zod schema
  const result = transactionSchema.safeParse(rawData)

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors }
  }

  let currency: CashDenomination
  if (result.data.asset_type === 'future') {
    currency = 'USD'
    if (!futureSymbolAllowed(result.data.symbol)) {
      return { error: 'Symbol is not in the crypto catalog' }
    }
  } else if (result.data.asset_type === 'cash') {
    if (isCashDenomination(result.data.currency)) {
      currency = result.data.currency
    } else if (isCashDenomination(transaction.currency)) {
      currency = transaction.currency
    } else {
      const profile = await getCurrentUserProfile()
      currency = profile?.preferredCurrency || 'USD'
    }
  } else if (transaction.currency === 'USD' || transaction.currency === 'EUR') {
    // Keep the entry currency so a price stays in the currency it was entered in.
    currency = transaction.currency
  } else {
    const profile = await getCurrentUserProfile()
    currency = profile?.preferredCurrency || 'USD'
  }

  let quantity = result.data.quantity
  if (result.data.asset_type === 'cash' && quantity != null) {
    quantity = Number(Number(quantity).toFixed(2))
  }

  const row = saveRowFromForm(
    { ...result.data, quantity },
    currency,
    transactionId,
    transaction.created_at ?? null
  )
  if (row.asset_type === 'cash' && !isStableCash(currency)) {
    const sameFace =
      Number(transaction.quantity) === Number(row.quantity) &&
      Number(transaction.unit_price ?? 1) === Number(row.unit_price ?? 1) &&
      (transaction.currency || 'USD') === currency &&
      transaction.amount != null &&
      Number.isFinite(Number(transaction.amount))
    row.amount = sameFace
      ? Number(transaction.amount)
      : frozenFiatUsd(currency, row.quantity, row.unit_price, await getUsdToEurRate())
  }
  const bookError = await perpSaveError(supabase, user.id, {
    kind: 'update',
    id: transactionId,
    row,
  })
  if (bookError) return { error: bookError }

  const patch = { ...row }
  delete patch.id
  delete patch.created_at
  const { error } = await supabase
    .from('transactions')
    .update({
      ...patch,
      notes: result.data.notes ?? null,
    })
    .eq('id', transactionId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

/**
 * Fetches all transactions belonging to the current user.
 * Results are ordered by execution date (descending) so the table shows
 * the most recent transactions first.
 *
 * Returns empty array on any error (the dashboard handles graceful degradation).
 */
export async function getUserTransactions() {
  const user = await getCurrentUser()
  if (!user) return []

  const supabase = await createClient()

  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('executed_at', { ascending: false })

  if (error) {
    console.error('Error fetching transactions:', error)
    return []
  }

  return transactions || []
}

/**
 * Server actions for exports.
 * Used by the user dropdown menu.
 */
export async function getTransactionsForExport() {
  return await getUserTransactions()
}

export async function getHoldingsForExport() {
  const data = await getPortfolioData()
  if (data.error) return []
  return data.enrichedHoldings
}

// ============================================
// CSV IMPORT (bulk save after AI parse)
// ============================================

/**
 * Bulk imports a list of (user-reviewed) transactions.
 * Re-uses the same validation, currency, and auto-cash-credit logic as single create.
 * AI parsing lives in app/actions/ai/csv-import/parseCsvWithAI.ts.
 */
/** Hard cap — matches csvParsedTransactionsSchema / AI import client limit. */
const MAX_IMPORT_TRANSACTIONS = 200

export type ImportResult = {
  imported: number
  skipped: { index: number; symbol: string; reason: string }[]
}

function importInsertPayload(
  row: SaveRow & { notes?: string | null },
  userId: string
) {
  return {
    symbol: row.symbol,
    asset_type: row.asset_type,
    action: row.action,
    position_side: row.position_side ?? null,
    quantity: row.quantity ?? null,
    unit_price: row.unit_price ?? null,
    amount: row.amount ?? null,
    executed_at: row.executed_at,
    notes: row.notes ?? null,
    currency: row.currency === 'EUR' ? 'EUR' : 'USD',
    user_id: userId,
  }
}

export async function importTransactions(
  transactions: TransactionFormData[]
): Promise<ImportResult> {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) {
    return { imported: 0, skipped: [{ index: -1, symbol: '', reason: 'Not authenticated' }] }
  }

  if (!transactions || transactions.length === 0) {
    return {
      imported: 0,
      skipped: [{ index: -1, symbol: '', reason: 'No transactions to import' }],
    }
  }

  if (transactions.length > MAX_IMPORT_TRANSACTIONS) {
    return {
      imported: 0,
      skipped: [
        {
          index: -1,
          symbol: '',
          reason: `At most ${MAX_IMPORT_TRANSACTIONS} transactions per import. Split the file and try again.`,
        },
      ],
    }
  }

  const { data: existingRows, error: loadError } = await supabase
    .from('transactions')
    .select(SAVE_ROW_COLUMNS)
    .eq('user_id', user.id)
  if (loadError) {
    return { imported: 0, skipped: [{ index: -1, symbol: '', reason: loadError.message }] }
  }

  const profile = await getCurrentUserProfile()
  const defaultCurrency = profile?.preferredCurrency || 'USD'
  const symbols = new Set<string>()
  for (const row of existingRows || []) {
    if (row.asset_type === 'future' && row.symbol) symbols.add(String(row.symbol).toUpperCase())
  }
  for (const tx of transactions) {
    if (tx.asset_type === 'future' && tx.symbol) symbols.add(tx.symbol.toUpperCase())
  }
  const [usdToEurRate, marks] = await Promise.all([
    getUsdToEurRate(),
    getUsdMMarks([...symbols]),
  ])

  let pending = transactions.map((row, index) => ({ row, index }))
  let book = (existingRows || []) as SaveRow[]
  let imported = 0
  const skipped: ImportResult['skipped'] = []

  while (pending.length > 0) {
    const { steps } = planImport({
      existing: book,
      incoming: pending,
      usdToEurRate,
      marks,
      nowIso: new Date().toISOString(),
      defaultCurrency,
      futureSymbolAllowed,
    })
    if (steps.length === 0) break

    let writeFailed = false
    for (const step of steps) {
      if (!step.ok) {
        if (!skipped.some((item) => item.index === step.index)) {
          skipped.push({ index: step.index, symbol: step.symbol, reason: step.reason })
        }
        pending = pending.filter((item) => item.index !== step.index)
        continue
      }

      const [primary, ...extra] = step.rows
      if (!primary) {
        pending = pending.filter((item) => item.index !== step.index)
        continue
      }
      const { error } = await supabase
        .from('transactions')
        .insert(importInsertPayload(primary, user.id))
      if (error) {
        skipped.push({ index: step.index, symbol: primary.symbol, reason: error.message })
        pending = pending.filter((item) => item.index !== step.index)
        writeFailed = true
        break
      }

      imported++
      const written: SaveRow[] = [primary]
      for (const extraRow of extra) {
        const { error: extraError } = await supabase
          .from('transactions')
          .insert(importInsertPayload(extraRow, user.id))
        if (extraError) {
          console.error('Auto cash credit during import failed:', extraError.message)
        } else {
          written.push(extraRow)
        }
      }
      book = [...book, ...written]
      pending = pending.filter((item) => item.index !== step.index)
    }
    if (!writeFailed) break
  }

  if (imported > 0) {
    revalidatePath('/dashboard')
  }

  return { imported, skipped }
}