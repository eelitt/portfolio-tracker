/**
 * Watchlist add/remove may run only for a command phrase that names the
 * symbol in that phrase. List stays a read. English verbs, same as confirm.
 * Negation is not detected: "do not add X to my watchlist" still matches.
 */

export type WatchlistMutation = 'add' | 'remove'

const BETWEEN_MAX = 80
const TAIL_MAX = 40
const BARE_MAX = 40

const FILLER = new Set([
  'a',
  'an',
  'the',
  'my',
  'to',
  'on',
  'onto',
  'into',
  'from',
  'please',
  'and',
  'or',
  'add',
  'include',
  'put',
  'remove',
  'delete',
  'drop',
  'unwatch',
  'watch',
  'list',
  'watchlist',
  'this',
  'that',
  'it',
])

const ADD_RE = new RegExp(
  `\\b(?:add|include|put)\\b([\\s\\S]{0,${BETWEEN_MAX}}?)\\b(?:onto|into|to|on)\\s+(?:my\\s+|the\\s+)?watch\\s*list\\b`,
  'gi'
)

const REMOVE_RE = new RegExp(
  `\\b(?:remove|delete|drop)\\b([\\s\\S]{0,${BETWEEN_MAX}}?)\\bfrom\\s+(?:my\\s+|the\\s+)?watch\\s*list\\b`,
  'gi'
)

const UNWATCH_RE = new RegExp(`\\bunwatch\\b([\\s\\S]{0,${TAIL_MAX}})`, 'gi')

function words(span: string): string[] {
  return span.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

function fillerOnly(span: string): boolean {
  const tokens = words(span)
  return tokens.length === 0 || tokens.every((token) => FILLER.has(token))
}

function targetFromPhrase(match: RegExpExecArray, text: string): string {
  const between = match[1] ?? ''
  if (!fillerOnly(between)) return between
  const after = match.index + match[0].length
  return text.slice(after, after + TAIL_MAX)
}

function spansFor(re: RegExp, text: string): string[] {
  const global = new RegExp(re.source, re.flags)
  const spans: string[] = []
  let match: RegExpExecArray | null
  while ((match = global.exec(text))) {
    spans.push(targetFromPhrase(match, text))
    if (match.index === global.lastIndex) global.lastIndex += 1
  }
  return spans
}

function unwatchSpans(text: string): string[] {
  const global = new RegExp(UNWATCH_RE.source, UNWATCH_RE.flags)
  const spans: string[] = []
  let match: RegExpExecArray | null
  while ((match = global.exec(text))) {
    spans.push(match[1] ?? '')
    if (match.index === global.lastIndex) global.lastIndex += 1
  }
  return spans
}

/**
 * Text in which the symbol must appear, or null when this message is not
 * that command. Several phrases are joined. An empty string means the
 * command matched and named nothing.
 */
export function watchlistCommandSpan(
  text: string,
  kind: WatchlistMutation
): string | null {
  const spans =
    kind === 'add'
      ? spansFor(ADD_RE, text)
      : [...spansFor(REMOVE_RE, text), ...unwatchSpans(text)]
  if (spans.length === 0) return null
  return spans.join('\n')
}

export function watchlistMutationRequested(
  text: string,
  kind: WatchlistMutation
): boolean {
  return watchlistCommandSpan(text, kind) != null
}

export type PhraseHit =
  | { kind: 'unique'; symbol: string }
  | { kind: 'ambiguous' }
  | { kind: 'none' }

export type PhraseResolver = (phrase: string) => PhraseHit

function nonFillerTokens(span: string): string[] {
  return words(span).filter((token) => !FILLER.has(token))
}

/**
 * The resolved symbol is allowed when the span's phrase is that symbol,
 * or when every token is its own symbol and this is one of them.
 */
export function watchlistSpanAllowsSymbol(
  span: string,
  symbol: string,
  resolve: PhraseResolver
): boolean {
  const tokens = nonFillerTokens(span)
  if (tokens.length === 0) return false
  const wanted = symbol.trim().toUpperCase()
  const phraseHit = resolve(tokens.join(' '))
  if (phraseHit.kind === 'unique' && phraseHit.symbol.toUpperCase() === wanted) {
    return true
  }
  if (tokens.length < 2) return false
  const hits = tokens.map((token) => resolve(token))
  if (!hits.every((hit) => hit.kind === 'unique')) return false
  return hits.some(
    (hit) => hit.kind === 'unique' && hit.symbol.toUpperCase() === wanted
  )
}

/**
 * A one-word follow-up is open when the command named nothing, or named an
 * ambiguous catalog word. A unique symbol or unknown prose closes it.
 */
export function watchlistFollowUpOpen(
  span: string,
  resolve: PhraseResolver
): boolean {
  const tokens = nonFillerTokens(span)
  if (tokens.length === 0) return true
  return resolve(tokens.join(' ')).kind === 'ambiguous'
}

function needleInMessage(haystack: string, needle: string): boolean {
  const trimmed = needle.trim()
  if (trimmed.length < 2 || trimmed.length > BARE_MAX) return false
  if (/\s/.test(trimmed)) {
    return haystack.toLowerCase().includes(trimmed.toLowerCase())
  }
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack)
}

/**
 * The query, resolved symbol, or catalog name must show up in the command span.
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

/** The whole reply is the ticker or name, for the turn after a command. */
export function watchlistBareTarget(
  text: string,
  parts: { query: string; symbol: string; name: string }
): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 2 || trimmed.length > BARE_MAX) return false
  const lower = trimmed.toLowerCase()
  return [parts.query, parts.symbol, parts.name].some((part) => {
    const needle = part.trim()
    return needle.length >= 2 && needle.length <= BARE_MAX && needle.toLowerCase() === lower
  })
}
