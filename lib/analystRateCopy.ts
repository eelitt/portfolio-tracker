/** User-facing chat limiter copy. Shared by the RPC path and the fallback. */

export function analystRateLimitError(
  reason: 'gap' | 'window',
  retryAfterMs: number
): string {
  if (reason === 'gap') {
    const wait = Math.max(1, Math.ceil(retryAfterMs / 1000))
    return `Please wait ${wait} second${wait === 1 ? '' : 's'} before sending another message.`
  }
  const resetIn = Math.max(1, Math.ceil(retryAfterMs / 60000))
  return `Rate limit reached (30 messages / 15 min). Try again in about ${resetIn} minute(s).`
}
