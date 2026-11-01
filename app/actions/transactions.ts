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
import { getUsdToEurRate } from '@/lib/currency'
import { getUsdMMarks } from '@/lib/prices/binanceUsdM'
import { ledgerPerpRows, validatePerps } from '@/lib/perps'
import {
  cashEventsInUsd,
  ledgerAfterSave,
  type SaveChange,
  type SaveRow,
} from '@/lib/perpSave'
import { getSymbolsForType } from '@/lib/symbols'

/** Shape returned by mutation actions to the client (used with useActionState). */
export type ActionState = {
  error?: string | Record<string, string[]>
  success?: boolean
}

export type CreateTransactionResult =
  | { ok: true; data: TransactionFormData & { currency: 'USD' | 'EUR' } }
  | { ok: false; error: string }

const SAVE_ROW_COLUMNS =
  'id, symbol, asset_type, action, position_side, quantity, unit_price, amount, executed_at, created_at, currency'

function futureSymbolAllowed(symbol: string): boolean {
  const upper = symbol.trim().toUpperCase()
  return getSymbolsForType('crypto').some((entry) => entry.symbol.toUpperCase() === upper)
}

function saveRowFromForm(
  data: TransactionFormData,
  currency: 'USD' | 'EUR',
  id?: string,
  createdAt?: string | null
): SaveRow {
  const future = data.asset_type === 'future'
  const wallet =
    data.action === 'funding' ||
    data.action === 'fee' ||
    data.action === 'margin_add' ||
    data.action === 'margin_remove'
  return {
    id,
    symbol: data.symbol,
    asset_type: data.asset_type,
    action: data.action,
    position_side: future ? data.position_side : null,
    quantity: future && wallet ? null : data.quantity,
    unit_price: future && wallet ? null : data.unit_price,
    amount: future ? data.amount : null,
    executed_at: data.executed_at,
    created_at: createdAt,
    currency: future ? 'USD' : currency,
  }
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
  if (rows.length === 0) return null

  const symbols = [...new Set(rows.map((row) => row.symbol))]
  const [usdToEurRate, marks] = await Promise.all([
    getUsdToEurRate(),
    getUsdMMarks(symbols),
  ])
  const saved = validatePerps({
    rows,
    cash: cashEventsInUsd(ledger, usdToEurRate),
    marks,
  })
  if (!saved.ok) return saved.reason
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

  let currency: 'USD' | 'EUR' | undefined = result.data.currency
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
    currency as 'USD' | 'EUR'
  )
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
      currency: row.currency as 'USD' | 'EUR',
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
    .select('user_id, asset_type, currency, created_at')
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

  let currency: 'USD' | 'EUR'
  if (result.data.asset_type === 'future') {
    currency = 'USD'
    if (!futureSymbolAllowed(result.data.symbol)) {
      return { error: 'Symbol is not in the crypto catalog' }
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

export async function importTransactions(
  transactions: TransactionFormData[]
): Promise<{ imported: number; errors: string[] }> {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) {
    return { imported: 0, errors: ['Not authenticated'] }
  }

  if (!transactions || transactions.length === 0) {
    return { imported: 0, errors: ['No transactions to import'] }
  }

  if (transactions.length > MAX_IMPORT_TRANSACTIONS) {
    return {
      imported: 0,
      errors: [
        `At most ${MAX_IMPORT_TRANSACTIONS} transactions per import. Split the file and try again.`,
      ],
    }
  }

  const profile = await getCurrentUserProfile()
  const defaultCurrency = profile?.preferredCurrency || 'USD'

  let imported = 0
  const errors: string[] = []

  for (const tx of transactions) {
    const result = transactionSchema.safeParse(tx)
    if (!result.success) {
      errors.push(`Row for ${tx.symbol || 'unknown'}: ${Object.values(result.error.flatten().fieldErrors).flat().join(', ')}`)
      continue
    }

    const validated = result.data

    const insertData: TransactionFormData & { currency: 'USD' | 'EUR' } = {
      ...validated,
      currency: validated.currency || defaultCurrency,
    }

    if (insertData.asset_type === 'cash' && insertData.quantity != null) {
      insertData.quantity = Number(Number(insertData.quantity).toFixed(2))
    }
    if (insertData.asset_type === 'future') {
      insertData.currency = 'USD'
      if (!futureSymbolAllowed(insertData.symbol)) {
        errors.push(`Failed to import ${validated.symbol}: Symbol is not in the crypto catalog`)
        continue
      }
    }

    if (
      validated.asset_type === 'future' ||
      validated.asset_type === 'cash' ||
      creditsSpotProceeds(validated)
    ) {
      const bookError = await perpSaveError(supabase, user.id, {
        kind: 'create',
        row: saveRowFromForm(validated, insertData.currency),
      })
      if (bookError) {
        errors.push(`Failed to import ${validated.symbol}: ${bookError}`)
        continue
      }
    }

    const { error } = await supabase.from('transactions').insert({
      ...insertData,
      user_id: user.id,
    })

    if (error) {
      errors.push(`Failed to import ${validated.symbol}: ${error.message}`)
      continue
    }

    imported++

    // Auto credit sale proceeds to Available Cash (best-effort, same as manual create)
    if (creditsSpotProceeds(validated)) {
      const proceeds = Number(validated.quantity) * Number(validated.unit_price)
      if (proceeds > 0) {
        const sellCurrency = insertData.currency || 'USD'
        const cashInsert = {
          symbol: 'Available Cash',
          asset_type: 'cash',
          action: 'inflow',
          quantity: Number(proceeds.toFixed(2)),
          unit_price: 1,
          executed_at: validated.executed_at,
          notes: `Proceeds from SELL ${validated.quantity} ${validated.symbol} @ ${validated.unit_price}`,
          currency: sellCurrency,
          user_id: user.id,
        }
        const { error: cashError } = await supabase.from('transactions').insert(cashInsert)
        if (cashError) {
          console.error('Auto cash credit during import failed:', cashError.message)
        }
      }
    }
  }

  if (imported > 0) {
    revalidatePath('/dashboard')
  }

  return { imported, errors }
}