'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getCurrentUser } from '@/lib/user'

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

  revalidateTag('prices', { expire: 0 })
  revalidatePath('/dashboard')
  return { success: true }
}
