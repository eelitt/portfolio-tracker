'use server'

/**
 * Holding News server action — public entry for the sidebar / AI Insights UI.
 * Core pipeline: runHoldingNews in service.ts (also used by the News Agent).
 *
 * Note: do not re-export types from this 'use server' file — Next’s action
 * bundler can turn `export type` into a runtime export and throw
 * ReferenceError: HoldingNewsResult is not defined.
 */

import { getCurrentUser } from '@/lib/user'
import { runHoldingNews } from './service'
import type { HoldingNewsResult } from './service'

/**
 * Fetch live holding news for the user's top holdings, then impact analysis.
 * Non-admin: at most one full package check per 24h unless new uncovered symbols.
 */
export async function generateHoldingNews(): Promise<HoldingNewsResult> {
  const user = await getCurrentUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Sidebar: try live when cooldown allows; may show cooldown copy if blocked
  return runHoldingNews({
    userId: user.id,
    forceRefresh: true,
    mode: 'ui',
  })
}
