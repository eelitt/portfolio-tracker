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

/**
 * Public URL candidates for a holding logo, preferred order: svg then png.
 * Tries lowercase ticker first, then a catalog-name slug (e.g. tesla.svg for TSLA).
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

  const stems = [ticker]
  const catalog = getSymbolsForType(assetType).find(
    (s) => s.symbol.toUpperCase() === ticker.toUpperCase()
  )
  const slug = catalog?.name ? nameSlug(catalog.name) : ''
  if (slug && slug !== ticker) stems.push(slug)

  return stems.flatMap((stem) =>
    LOGO_EXTS.map((ext) => `/holdings/logos/${folder}/${stem}.${ext}`)
  )
}
