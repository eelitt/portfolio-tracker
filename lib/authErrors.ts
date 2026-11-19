/** Messages shown on the login and signup screens. */

export const AUTH_NETWORK_MESSAGE =
  'Unable to connect to the service. Please check your internet connection and try again.'

export const AUTH_CONFIG_MESSAGE =
  'There is a configuration error with the backend. Please contact support.'

export const LOGIN_FAILURE_MESSAGE = 'Invalid email or password.'

export const SIGNUP_FAILURE_MESSAGE = 'Could not create the account.'

type AuthErrorLike = {
  message?: string
  code?: string
  cause?: unknown
} | null

function causeCode(cause: unknown): string {
  if (!cause || typeof cause !== 'object' || !('code' in cause)) return ''
  const code = (cause as { code?: unknown }).code
  return typeof code === 'string' ? code : ''
}

export function isAuthNetworkError(error: AuthErrorLike): boolean {
  if (!error) return false
  const message = (error.message || '').toLowerCase()
  return (
    message.includes('fetch') ||
    message.includes('failed to fetch') ||
    message.includes('network') ||
    error.code === 'ENOTFOUND' ||
    causeCode(error.cause) === 'ENOTFOUND'
  )
}

/** Login and signup show one of three lines. The raw provider message stays in the console. */
export function authScreenMessage(
  error: AuthErrorLike,
  kind: 'login' | 'signup'
): string {
  if (isAuthNetworkError(error)) return AUTH_NETWORK_MESSAGE
  const message = (error?.message || '').toLowerCase()
  if (
    message.includes('invalid api key') ||
    message.includes('project not found')
  ) {
    return AUTH_CONFIG_MESSAGE
  }
  return kind === 'login' ? LOGIN_FAILURE_MESSAGE : SIGNUP_FAILURE_MESSAGE
}
