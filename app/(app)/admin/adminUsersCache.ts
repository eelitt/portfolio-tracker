import {
  listUsersForAdmin,
  type AdminAccessEventRow,
  type AdminUserRow,
} from '@/app/actions/admin'

type AdminListResult = {
  data?: AdminUserRow[]
  events?: AdminAccessEventRow[]
  error?: string
}

/** In-memory session cache for admin user list (cleared on full page reload). */
let cachedUsers: AdminUserRow[] | null = null
let cachedEvents: AdminAccessEventRow[] | null = null
let inflight: Promise<AdminListResult> | null = null

export function getCachedAdminUsers(): AdminUserRow[] | null {
  return cachedUsers
}

export function getCachedAdminEvents(): AdminAccessEventRow[] | null {
  return cachedEvents
}

async function fetchAndCache(): Promise<AdminListResult> {
  try {
    const result = await listUsersForAdmin()
    if (result.data) {
      cachedUsers = result.data
      cachedEvents = result.events ?? []
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
}): Promise<AdminListResult> {
  const force = options?.force === true

  if (!force) {
    if (cachedUsers) {
      return { data: cachedUsers, events: cachedEvents ?? [] }
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
