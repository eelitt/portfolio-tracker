/**
 * PostgREST `or` filter for the 60s AI cooldown update.
 * The timestamp is quoted so its colons stay inside the value.
 */
export function aiCooldownOrFilter(cutoffIso: string): string {
  return `last_ai_call_at.is.null,last_ai_call_at.lt."${cutoffIso}"`
}
