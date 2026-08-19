'use server'

import { createClient } from '@/lib/supabase/server'
import { goalSchema } from '@/lib/schemas'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/user'
import { Goal } from '@/lib/types'

export type ActionState = {
  error?: string | Record<string, string[]>
  success?: boolean
}

function rawFromForm(formData: FormData) {
  return {
    name: formData.get('name'),
    target_amount: formData.get('target_amount'),
    notes: formData.get('notes'),
    is_completed: formData.get('is_completed') === 'true',
    target_date: formData.get('target_date'),
    planned_monthly: formData.get('planned_monthly'),
    assigned_amount: formData.get('assigned_amount'),
    include_cash: formData.get('include_cash') === 'true',
  }
}

export async function createGoal(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient()

  const result = goalSchema.safeParse(rawFromForm(formData))

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  const insertData: Record<string, unknown> = {
    ...result.data,
    user_id: user.id,
    target_date: result.data.target_date ?? null,
    planned_monthly: result.data.planned_monthly ?? null,
    assigned_amount: result.data.assigned_amount ?? null,
  }

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
  const { data: goal } = await supabase
    .from('goals')
    .select('user_id')
    .eq('id', goalId)
    .single()

  if (!goal || goal.user_id !== user.id) {
    return { error: 'Unauthorized' }
  }

  const { error } = await supabase.from('goals').delete().eq('id', goalId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function updateGoal(goalId: string, formData: FormData) {
  const supabase = await createClient()
  const user = await getCurrentUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { data: goal } = await supabase
    .from('goals')
    .select('user_id, is_completed, completed_at')
    .eq('id', goalId)
    .single()

  if (!goal || goal.user_id !== user.id) {
    return { error: 'Unauthorized' }
  }

  const result = goalSchema.safeParse(rawFromForm(formData))

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors }
  }

  const updateData: Record<string, unknown> = {
    ...result.data,
    target_date: result.data.target_date ?? null,
    planned_monthly: result.data.planned_monthly ?? null,
    assigned_amount: result.data.assigned_amount ?? null,
    updated_at: new Date().toISOString(),
  }

  if (updateData.is_completed && !goal.is_completed) {
    updateData.completed_at = new Date().toISOString()
  } else if (!updateData.is_completed) {
    updateData.completed_at = null
  }

  const { error } = await supabase.from('goals').update(updateData).eq('id', goalId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

const GOAL_COLUMNS =
  'id, name, target_amount, notes, is_completed, completed_at, target_date, planned_monthly, assigned_amount, include_cash, created_at, updated_at'

export async function getUserGoals() {
  const user = await getCurrentUser()
  if (!user) return []

  const supabase = await createClient()

  const { data: goals, error } = await supabase
    .from('goals')
    .select(GOAL_COLUMNS)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching goals:', error)
    return []
  }

  return (goals || []) as Goal[]
}
