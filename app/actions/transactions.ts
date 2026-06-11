'use server'

import { createClient } from '@/lib/supabase/server'
import { transactionSchema } from '@/lib/schemas'
import { revalidatePath } from 'next/cache'

export type ActionState = {
  error?: string | Record<string, string[]>
  success?: boolean
}

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

  const { error } = await supabase.from('transactions').insert({
    ...result.data,
    user_id: user.id,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteTransaction(transactionId: string) {
  const supabase = await createClient()

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

export async function updateTransaction(
  transactionId: string,
  formData: FormData
) {
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

  // Reuse the same Zod schema we created earlier
  const result = transactionSchema.safeParse(rawData)

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors }
  }

  const { error } = await supabase
    .from('transactions')
    .update(result.data)
    .eq('id', transactionId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true }
}