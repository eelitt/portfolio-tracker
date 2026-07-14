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
import { transactionSchema, csvParsedTransactionsSchema, type CsvParsedTransactions, type TransactionFormData } from '@/lib/schemas'
import { revalidatePath } from 'next/cache'
import { getCurrentUser, getCurrentUserProfile } from './users'
import { getPortfolioData } from '@/lib/portfolioData'
import {
  getLastAICallTime,
  updateLastAICallTime,
} from './ai'

/** Shape returned by mutation actions to the client (used with useActionState). */
export type ActionState = {
  error?: string | Record<string, string[]>
  success?: boolean
}

/**
 * Creates a new transaction for the currently authenticated user.
 * Validates input with Zod before touching the database.
 */
export async function createTransaction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient()

  const rawData = {
    symbol: formData.get('symbol'),
    asset_type: formData.get('asset_type'),
    action: formData.get('action'),
    quantity: formData.get('quantity'),
    unit_price: formData.get('unit_price'),
    executed_at: formData.get('executed_at'),
    notes: formData.get('notes'),
  }

  const result = transactionSchema.safeParse(rawData)

  if (!result.success) {
    return { 
      error: result.error.flatten().fieldErrors 
    }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  let insertData: any = { ...result.data }

  // Record the currency the unit_price (or cash amount) was entered in, using the user's
  // preferred currency at the time of the transaction. This allows correct conversions
  // even if the user later changes their preferred currency.
  // Legacy non-cash transactions without currency are treated as USD downstream.
  if (!insertData.currency) {
    const profile = await getCurrentUserProfile()
    insertData.currency = profile?.preferredCurrency || 'USD'
  }

  // Cash quantities are always in 2 decimal places (fiat)
  if (insertData.asset_type === 'cash') {
    insertData.quantity = Number(Number(insertData.quantity).toFixed(2))
  }

  const { error } = await supabase.from('transactions').insert({
    ...insertData,
    user_id: user.id,
  })

  if (error) {
    return { error: error.message }
  }

  // Automatically credit sale proceeds to the "Available Cash" holding.
  // The cash credit uses action 'inflow' and the *same currency* as the sell.

  if (result.data.action === 'sell' && result.data.asset_type !== 'cash') {
    const proceeds = Number(result.data.quantity) * Number(result.data.unit_price)
    if (proceeds > 0) {
      const sellCurrency = insertData.currency || 'USD'
      const cashInsert = {
        symbol: 'Available Cash',
        asset_type: 'cash',
        action: 'inflow',
        quantity: Number(proceeds.toFixed(2)),
        unit_price: 1,
        executed_at: result.data.executed_at,
        notes: `Proceeds from SELL ${result.data.quantity} ${result.data.symbol} @ ${result.data.unit_price}`,
        currency: sellCurrency,
        user_id: user.id,
      }
      const { error: cashError } = await supabase.from('transactions').insert(cashInsert)
      if (cashError) {
        // Do not fail the user's sell transaction. Cash credit is best-effort.
        console.error('Auto cash credit for sell proceeds failed:', cashError.message)
      }
    }
  }

  revalidatePath('/dashboard')
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
    .select('user_id, asset_type, currency')
    .eq('id', transactionId)
    .single()

    if (!transaction || transaction.user_id !== user.id) {
    return { error: 'Unauthorized' }
  }

  const rawData = {
    symbol: formData.get('symbol'),
    asset_type: formData.get('asset_type'),
    action: formData.get('action'),
    quantity: formData.get('quantity'),
    unit_price: formData.get('unit_price'),
    executed_at: formData.get('executed_at'),
    notes: formData.get('notes'),
  }

  // Reuse zod schema
  const result = transactionSchema.safeParse(rawData)

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors }
  }

  let updateData: any = { ...result.data }

  // Preserve the original entry currency if this transaction already had one recorded
  // (so historical prices stay denominated in the currency they were entered in).
  // If no previous currency (legacy non-cash tx or type change), record current preferred.
  if (transaction.currency) {
    updateData.currency = transaction.currency
  } else if (!updateData.currency) {
    const profile = await getCurrentUserProfile()
    updateData.currency = profile?.preferredCurrency || 'USD'
  }

  // Cash quantities are always in 2 decimal places (fiat)
  if ((updateData.asset_type || transaction.asset_type) === 'cash' && updateData.quantity != null) {
    updateData.quantity = Number(Number(updateData.quantity).toFixed(2))
  }

  const { error } = await supabase
    .from('transactions')
    .update(updateData)
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
// CSV IMPORT (AI-powered parser + bulk save)
// ============================================

/**
 * Parses a CSV using the AI model as the parser.
 *
 * Client MUST perform the 200-row count BEFORE calling this (cost protection).
 * Server applies rate limiting and defensive checks.
 */
export async function parseCsvWithAI(
  csvContent: string
): Promise<{ data?: CsvParsedTransactions; error?: string }> {
  const user = await getCurrentUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  if (!process.env.XAI_API_KEY) {
    return { error: 'AI service is not configured.' }
  }

  // Basic defensive row count (primary gate is on the client)
  const rowCount = csvContent.split('\n').filter(Boolean).length - 1
  if (rowCount > 200) {
    return { error: 'CSV contains more than 200 rows. Please split the file and import in batches.' }
  }

  if (!csvContent || csvContent.trim().length < 10) {
    return { error: 'The selected file appears to be empty or invalid.' }
  }

  // Rate limit (same 60s cooldown as other AI features)
  const lastCall = await getLastAICallTime(user.id)
  if (lastCall) {
    const secondsSince = (Date.now() - lastCall.getTime()) / 1000
    if (secondsSince < 60) {
      const wait = Math.ceil(60 - secondsSince)
      return { error: `Please wait ${wait} seconds before using AI import again.` }
    }
  }

  // Truncate just in case (client should have already capped)
  const safeContent = csvContent.slice(0, 50000)

  try {
    const { generateObject } = await import('ai')
    const { xai } = await import('@ai-sdk/xai')

    const { object } = await generateObject({
      model: xai('grok-4.3'),
      schema: csvParsedTransactionsSchema,
      system: `You are an expert, precise, and conservative financial CSV transaction parser.
Return ONLY structured data that matches the provided schema exactly.
- Map common exchange columns (Date, Time, Side, Symbol, Amount, Quantity, Price, Total, Notes, etc.) to our fields.
- Convert any date format to YYYY-MM-DD.
- Uppercase all symbols.
- Map actions: BUY/buy/b → buy, SELL/sell/s → sell, DEPOSIT/INFLOW/DEPOSIT → inflow, WITHDRAW/WITHDRAWAL/OUTFLOW → outflow.
- For cash rows use asset_type "cash" and unit_price 1.
- Never invent missing values — prefer to leave notes indicating uncertainty.
- Keep output minimal and accurate.`,
      prompt: `User's preferred display currency is available for context. Parse the following CSV export from an exchange or broker into transactions.

CSV content:
${safeContent}

Return an array of transactions plus any warnings about unmapped columns or ambiguities.`,
      maxTokens: 2000,
    })

    // Update cooldown
    await updateLastAICallTime(user.id)

    return { data: object }
  } catch (e) {
    console.error('AI CSV parse error', e)
    return { error: 'Failed to parse CSV with AI. The file format may be unsupported or the content too complex. You can still add transactions manually.' }
  }
}

/**
 * Bulk imports a list of (user-reviewed) transactions.
 * Re-uses the same validation, currency, and auto-cash-credit logic as single create.
 */
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

    let insertData: any = { ...validated }

    if (!insertData.currency) {
      insertData.currency = defaultCurrency
    }

    if (insertData.asset_type === 'cash') {
      insertData.quantity = Number(Number(insertData.quantity).toFixed(2))
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
    if (validated.action === 'sell' && validated.asset_type !== 'cash') {
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