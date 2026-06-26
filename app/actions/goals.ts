'use server'

import { createClient } from '@/lib/supabase/server'
import { goalSchema } from '@/lib/schemas'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from './users'
import { getPortfolioData } from '@/lib/portfolioData'
import { Goal } from '@/lib/types'

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
    notes: formData.get('notes'),
    is_completed: formData.get('is_completed') === 'true',
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

  const insertData: any = { ...result.data, user_id: user.id }

  // If marking as completed on create, set completed_at
  if (insertData.is_completed && !insertData.completed_at) {
    insertData.completed_at = new Date().toISOString()
  }

  const { error } = await supabase.from('goals').insert(insertData)

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
    .select('user_id, is_completed, completed_at')
    .eq('id', goalId)
    .single()

    if (!goal || goal.user_id !== user.id) {
    return { error: 'Unauthorized' }
  }

  const rawData = {
    name: formData.get('name'),
    target_amount: formData.get('target_amount'),
    notes: formData.get('notes'),
    is_completed: formData.get('is_completed') === 'true',
  }

  // Reuse the same Zod schema 
  const result = goalSchema.safeParse(rawData)

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors }
  }

  const updateData: any = { ...result.data, updated_at: new Date().toISOString() }

  // Set completed_at only if becoming completed now (was not before)
  if (updateData.is_completed && !goal.is_completed) {
    updateData.completed_at = new Date().toISOString()
  } else if (!updateData.is_completed) {
    updateData.completed_at = null
  }

  const { error } = await supabase
    .from('goals')
    .update(updateData)
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
    .select('id, name, target_amount, notes, is_completed, completed_at, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching goals:', error)
    return []
  }

  return (goals || []) as Goal[]
}

export async function getCurrentPortfolioValue(): Promise<number> {
  const data = await getPortfolioData()
  if (data.error) {
    return 0
  }
  return data.totalMarketValue
}