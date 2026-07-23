'use server'

import { revalidatePath, revalidateTag } from 'next/cache'

/**
 * Bust the Next.js Data Cache for live prices and revalidate the dashboard.
 * Call before router.refresh() so the next getPortfolioData() re-fetches quotes.
 */
export async function refreshPortfolioPrices(): Promise<{ success: true }> {
  revalidateTag('prices', { expire: 0 })
  revalidatePath('/dashboard')
  return { success: true }
}
