'use server'

import { createClient } from '@/lib/supabase/server'
import { goalSchema } from '@/lib/schemas'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from './users'
import { getPortfolioData } from '@/lib/portfolioData'

export type ActionState = {
  error?: string | Record<string, string[]>
  success?: boolean
}

export async function createGoal(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient()

  const rawData = {
    name: formData.get('name'),
    target_amount: formData.get('target_amount'),
  }

  const result = goalSchema.safeParse(rawData)

  if (!result.success) {
    return { 
      error: result.error.flatten().fieldErrors 
    }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { error } = await supabase.from('goals').insert({
    ...result.data,
    user_id: user.id,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteGoal(goalId: string) {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }
  // verify ownership
  const { data: goal } = await supabase
    .from('goals')
    .select('user_id')
    .eq('id', goalId)
    .single()

    if (!goal || goal.user_id !== user.id) {
    return { error: 'Unauthorized' }
  }

  const { error } = await supabase
    .from('goals')
    .delete()
    .eq('id', goalId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function updateGoal(
  goalId: string,
  formData: FormData
) {
  const supabase = await createClient()
 const user = await getCurrentUser()
 
  if (!user) {
    return { error: 'Not authenticated' }
  }

  // verify ownership
  const { data: goal } = await supabase
    .from('goals')
    .select('user_id')
    .eq('id', goalId)
    .single()

    if (!goal || goal.user_id !== user.id) {
    return { error: 'Unauthorized' }
  }

  const rawData = {
    name: formData.get('name'),
    target_amount: formData.get('target_amount'),
  }

  // Reuse the same Zod schema 
  const result = goalSchema.safeParse(rawData)

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors }
  }

  const { error } = await supabase
    .from('goals')
    .update(result.data)
    .eq('id', goalId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function getUserGoals() {
  const user = await getCurrentUser()
  if (!user) return []

  const supabase = await createClient()

  const { data: goals, error } = await supabase
    .from('goals')
    .select('id, name, target_amount')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching goals:', error)
    return []
  }

  return goals || []
}

export async function getCurrentPortfolioValue(): Promise<number> {
  const data = await getPortfolioData()
  if (data.error) {
    return 0
  }
  return data.totalMarketValue
}