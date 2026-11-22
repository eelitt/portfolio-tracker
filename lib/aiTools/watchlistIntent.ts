/**
 * Watchlist add/remove may run only when this user message asks for that
 * change and names the symbol. List stays a read. English verbs, same as confirm.
 */

export type WatchlistMutation = 'add' | 'remove'

const ADD_VERBS = ['add', 'put', 'include']
const REMOVE_VERBS = ['remove', 'delete', 'drop', 'unwatch']
const VERB_GAP = 60
const QUERY_NEEDLE_MAX = 40

function gapAllows(text: string, verbs: string[]): boolean {
  const lower = text.toLowerCase()
  const spots: Array<{ start: number; end: number }> = []
  const watch = /watch\s*list/g
  let found: RegExpExecArray | null
  while ((found = watch.exec(lower))) {
    spots.push({ start: found.index, end: found.index + found[0].length })
  }
  if (spots.length === 0) return false

  for (const verb of verbs) {
    const verbRe = new RegExp(`\\b${verb}\\b`, 'g')
    let hit: RegExpExecArray | null
    while ((hit = verbRe.exec(lower))) {
      const verbStart = hit.index
      const verbEnd = hit.index + hit[0].length
      for (const spot of spots) {
        const gap =
          verbEnd <= spot.start
            ? spot.start - verbEnd
            : verbStart - spot.end
        if (gap >= 0 && gap <= VERB_GAP) return true
      }
    }
  }
  return false
}

export function watchlistMutationRequested(
  text: string,
  kind: WatchlistMutation
): boolean {
  return gapAllows(text, kind === 'add' ? ADD_VERBS : REMOVE_VERBS)
}

function needleInMessage(haystack: string, needle: string): boolean {
  const trimmed = needle.trim()
  if (trimmed.length < 2 || trimmed.length > QUERY_NEEDLE_MAX) return false
  if (/\s/.test(trimmed)) {
    return haystack.toLowerCase().includes(trimmed.toLowerCase())
  }
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack)
}

/**
 * The query, resolved symbol, or catalog name must show up in the user message.
 * A query longer than a name is ignored so the whole message cannot smuggle a ticker.
 */
export function watchlistTargetNamedInMessage(
  lastUserText: string,
  parts: { query: string; symbol: string; name: string }
): boolean {
  return (
    needleInMessage(lastUserText, parts.query) ||
    needleInMessage(lastUserText, parts.symbol) ||
    needleInMessage(lastUserText, parts.name)
  )
}
