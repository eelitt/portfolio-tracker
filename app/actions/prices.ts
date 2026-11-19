'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { consumeUserSlot } from '@/lib/consumeUserSlot'
import { getCurrentUser } from '@/lib/user'

const PRICE_REFRESH_MS = 15_000

/**
 * Bust the Next.js Data Cache for live prices and revalidate the dashboard.
 * Call before router.refresh() so the next getPortfolioData() re-fetches quotes.
 * Requires an authenticated session (shared price tag must not be public RPC).
 */
export async function refreshPortfolioPrices(): Promise<
  { success: true } | { error: string }
> {
  const user = await getCurrentUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  const slot = await consumeUserSlot({
    slot: 'price_refresh',
    windowMs: PRICE_REFRESH_MS,
    max: 1,
    minGapMs: PRICE_REFRESH_MS,
  })
  if (slot.status === 'denied') {
    return { error: 'Please wait a few seconds before refreshing prices again.' }
  }

  revalidateTag('prices', { expire: 0 })
  revalidatePath('/dashboard')
  return { success: true }
}
