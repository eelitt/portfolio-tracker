import {
  listUsersForAdmin,
  type AdminUserRow,
} from '@/app/actions/admin'

/** In-memory session cache for admin user list (cleared on full page reload). */
let cachedUsers: AdminUserRow[] | null = null
let inflight: Promise<{ data?: AdminUserRow[]; error?: string }> | null = null

export function getCachedAdminUsers(): AdminUserRow[] | null {
  return cachedUsers
}

export function setCachedAdminUsers(users: AdminUserRow[]): void {
  cachedUsers = users
}

export function clearCachedAdminUsers(): void {
  cachedUsers = null
}

async function fetchAndCache(): Promise<{ data?: AdminUserRow[]; error?: string }> {
  try {
    const result = await listUsersForAdmin()
    if (result.data) {
      cachedUsers = result.data
    }
    return result
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load users',
    }
  }
}

/**
 * Load admin users, optionally forcing a network refresh.
 * Successful results are cached; errors do not clear an existing good cache.
 * Concurrent non-force callers share one in-flight request.
 * Force waits for any in-flight request, then always fetches again (post-edit accuracy).
 */
export async function loadAdminUsers(options?: {
  force?: boolean
}): Promise<{ data?: AdminUserRow[]; error?: string }> {
  const force = options?.force === true

  if (!force) {
    if (cachedUsers) {
      return { data: cachedUsers }
    }
    if (inflight) {
      return inflight
    }
  } else if (inflight) {
    // Finish the in-flight load, then re-fetch so we see post-edit state
    await inflight
  }

  const request = fetchAndCache().finally(() => {
    if (inflight === request) {
      inflight = null
    }
  })
  inflight = request
  return request
}
