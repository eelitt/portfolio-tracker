/**
 * Atomic chat and price-refresh slots via consume_user_slot.
 * A missing function is reported so chat can keep its old read-modify-write.
 */

import 'server-only'

import { createClient } from '@/lib/supabase/server'

export type UserSlot = 'portfolio_analyst_rate' | 'price_refresh'

export type UserSlotResult =
  | { status: 'allowed' }
  | { status: 'missing_function' }
  | { status: 'denied'; reason: 'gap' | 'window'; retryAfterMs: number }

function isMissingFunction(error: { code?: string; message?: string }): boolean {
  if (error.code === 'PGRST202' || error.code === '42883') return true
  const message = (error.message || '').toLowerCase()
  return (
    message.includes('consume_user_slot') &&
    (message.includes('could not find') ||
      message.includes('does not exist') ||
      message.includes('not found'))
  )
}

export async function consumeUserSlot(args: {
  slot: UserSlot
  windowMs: number
  max: number
  minGapMs: number
}): Promise<UserSlotResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('consume_user_slot', {
    p_slot: args.slot,
    p_window_ms: args.windowMs,
    p_max: args.max,
    p_min_gap_ms: args.minGapMs,
  })

  if (error) {
    if (isMissingFunction(error)) return { status: 'missing_function' }
    console.error('consume_user_slot failed:', error.message)
    return { status: 'denied', reason: 'window', retryAfterMs: args.windowMs }
  }

  const row = data as {
    allowed?: boolean
    reason?: string
    retry_after_ms?: number
  } | null

  if (row?.allowed === true) return { status: 'allowed' }

  const reason = row?.reason === 'gap' ? 'gap' : 'window'
  const retryAfterMs =
    typeof row?.retry_after_ms === 'number' && row.retry_after_ms > 0
      ? row.retry_after_ms
      : args.minGapMs > 0
        ? args.minGapMs
        : args.windowMs
  return { status: 'denied', reason, retryAfterMs }
}
