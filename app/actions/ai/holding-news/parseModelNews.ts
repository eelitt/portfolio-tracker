import { holdingNewsSchema } from '@/lib/schemas'

function normalizeAssetName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\b(inc\.?|corp\.?|ltd\.?|llc|co\.?|company|the)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function resolveNewsKeyToSymbol(
  rawKey: string,
  holdings: Array<{ symbol: string; name: string }>
): string | null {
  const upper = rawKey.toUpperCase().trim()
  if (!upper) return null
  if (holdings.some((h) => h.symbol === upper)) return upper

  const keyNorm = normalizeAssetName(rawKey)
  if (!keyNorm || keyNorm.length < 3) return null

  for (const h of holdings) {
    const nameNorm = normalizeAssetName(h.name)
    if (!nameNorm) continue
    if (nameNorm === keyNorm) return h.symbol
    if (nameNorm.startsWith(keyNorm) || keyNorm.startsWith(nameNorm)) {
      return h.symbol
    }
  }
  return null
}

function coerceNewsRecord(value: unknown): Record<string, string[]> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const out: Record<string, string[]> = {}
  for (const [key, bullets] of Object.entries(
    value as Record<string, unknown>
  )) {
    if (!key.trim()) continue
    if (!Array.isArray(bullets)) {
      out[key] = []
      continue
    }
    out[key] = bullets
      .map((b) => String(b).trim())
      .filter(Boolean)
      .slice(0, 3)
  }
  return out
}

export function parseHoldingNewsJson(raw: string): Record<string, string[]> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  const jsonSlice =
    start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonSlice)
  } catch {
    console.error('Failed to parse holding news JSON', cleaned.slice(0, 500))
    return {}
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>

    if (obj.news) {
      const fromNews = coerceNewsRecord(obj.news)
      if (fromNews) {
        const result = holdingNewsSchema.safeParse({ news: fromNews })
        if (result.success) return result.data.news
        return fromNews
      }
    }

    const flat = coerceNewsRecord(obj)
    if (flat && Object.values(flat).some((arr) => arr.length > 0)) {
      const result = holdingNewsSchema.safeParse({ news: flat })
      if (result.success) return result.data.news
      return flat
    }
  }

  console.error(
    'Holding news schema validation failed for payload',
    String(raw).slice(0, 300)
  )
  return {}
}

export function normalizeHoldingNews(
  raw: Record<string, string[]>,
  symbols: string[],
  holdings?: Array<{ symbol: string; name: string }>
): Record<string, string[]> {
  const byUpper = new Map<string, string[]>()
  for (const [key, bullets] of Object.entries(raw)) {
    const cleaned = (Array.isArray(bullets) ? bullets : [])
      .map((b) => String(b).trim())
      .filter(Boolean)
      .slice(0, 3)

    let symbol = key.toUpperCase().trim()
    if (holdings && holdings.length > 0) {
      const resolved = resolveNewsKeyToSymbol(key, holdings)
      if (resolved) symbol = resolved
    }
    if (!symbol) continue

    const existing = byUpper.get(symbol)
    if (!existing || (existing.length === 0 && cleaned.length > 0)) {
      byUpper.set(symbol, cleaned)
    }
  }

  const out: Record<string, string[]> = {}
  for (const symbol of symbols) {
    out[symbol] = byUpper.get(symbol) ?? []
  }
  return out
}
