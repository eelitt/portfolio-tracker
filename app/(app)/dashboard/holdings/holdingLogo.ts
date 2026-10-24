/**
 * Holding card logo paths (public/holdings/logos/…).
 * Convention only — missing files are hidden at runtime (no placeholder).
 */

import type { AssetType } from '@/lib/types'
import { getSymbolsForType } from '@/lib/symbols'

const LOGO_EXTS = ['svg', 'png'] as const

function nameSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc\.?|corp\.?|ltd\.?|llc|co\.?|company|the)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}

function pushStem(stems: string[], stem: string) {
  const next = stem.trim().toLowerCase()
  // Public filenames only. "OP AMERIKKA INDEKSI A" is not a file and the
  // space breaks the <img> fallback before it reaches op.svg.
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(next)) return
  if (stems.includes(next)) return
  stems.push(next)
}

/** OP-Amerikka / "OP …" funds share public/holdings/logos/etf/op.svg. */
function opFundStem(symbol: string, name?: string): string | null {
  for (const raw of [symbol, name ?? '']) {
    const s = raw.trim().toLowerCase()
    if (s === 'op' || s.startsWith('op ') || s.startsWith('op-')) return 'op'
  }
  return null
}

/**
 * Public URL candidates for a holding logo, preferred order: svg then png.
 * Tries a safe lowercase ticker, then a catalog-name slug (e.g. tesla.svg for TSLA).
 * Symbols with spaces are not used as filenames. OP funds try etf/op.svg first.
 * Empty for cash or empty symbol.
 */
export function getHoldingLogoCandidates(
  symbol: string,
  assetType: AssetType
): string[] {
  const ticker = (symbol || '').trim().toLowerCase()
  if (!ticker) return []

  let folder: string | null = null
  switch (assetType) {
    case 'crypto':
      folder = 'crypto'
      break
    case 'stock':
      folder = 'stock'
      break
    case 'etf':
      folder = 'etf'
      break
    case 'cash':
    default:
      return []
  }

  const stems: string[] = []
  const catalog = getSymbolsForType(assetType).find(
    (s) => s.symbol.toUpperCase() === ticker.toUpperCase()
  )
  if (folder === 'etf') {
    const brand = opFundStem(ticker, catalog?.name)
    if (brand) pushStem(stems, brand)
  }
  pushStem(stems, ticker)
  if (catalog?.name) pushStem(stems, nameSlug(catalog.name))

  return stems.flatMap((stem) =>
    LOGO_EXTS.map((ext) => `/holdings/logos/${folder}/${stem}.${ext}`)
  )
}
