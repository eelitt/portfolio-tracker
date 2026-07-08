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
import { transactionSchema } from '@/lib/schemas'
import { revalidatePath } from 'next/cache'
import { getCurrentUser, getCurrentUserProfile } from './users'
import { getPortfolioData } from '@/lib/portfolioData'

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

  // For cash transactions, record the currency it was entered in (the user's preferred at creation time)
  // so that we can correctly convert the value if the user later changes their preferred currency.
  if (insertData.asset_type === 'cash') {
    const profile = await getCurrentUserProfile()
    insertData.currency = profile?.preferredCurrency || 'USD'
  }

  const { error } = await supabase.from('transactions').insert({
    ...insertData,
    user_id: user.id,
  })

  if (error) {
    return { error: error.message }
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

  // Reuse the same Zod schema we created earlier
  const result = transactionSchema.safeParse(rawData)

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors }
  }

  let updateData: any = { ...result.data }

  // For cash, preserve the original denomination currency (don't change it just because preference changed)
  if (updateData.asset_type === 'cash') {
    if (transaction.asset_type === 'cash' && transaction.currency) {
      updateData.currency = transaction.currency
    } else {
      // newly becoming cash or no previous currency
      const profile = await getCurrentUserProfile()
      updateData.currency = profile?.preferredCurrency || 'USD'
    }
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
 * Results are ordered by execution date (ascending) — the order expected
 * by calculateHoldings().
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
    .order('executed_at', { ascending: true })

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