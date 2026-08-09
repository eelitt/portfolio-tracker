/**
 * Dry-run / "what would the agent have done?" helpers.
 */

/** Detect dry-run intent from user text or explicit API flag. */
export function resolveDryRun(opts: {
  bodyDryRun?: boolean
  lastUserText?: string
}): boolean {
  if (opts.bodyDryRun === true) return true
  const t = (opts.lastUserText || '').trim()
  if (!t) return false
  // "dry run: …", "dry-run …", "what would you do if …", "what would you have done"
  if (/\bdry[\s-]*run\b/i.test(t)) return true
  if (/\bwhat would you (do|have done)\b/i.test(t)) return true
  return false
}

export function dryRunNote(wouldHave: string): {
  dryRun: true
  wouldHave: string
  note: string
} {
  return {
    dryRun: true,
    wouldHave,
    note: 'Dry-run only — nothing was saved or fetched live beyond safe reads.',
  }
}
