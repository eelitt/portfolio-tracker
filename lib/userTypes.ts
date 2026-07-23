/**
 * Shared user/profile types and copy — safe for client and server imports.
 * No server-only modules here.
 */

export type PreferredCurrency = 'USD' | 'EUR'

export interface UserProfile {
  id: string
  email?: string
  preferredCurrency: PreferredCurrency
  admin: boolean
  accessToApp: boolean
}

/** Shown when login/session is blocked for missing app access. */
export const APP_ACCESS_DENIED_MESSAGE =
  'Your account does not have access to this app yet. An administrator must approve your account.'
