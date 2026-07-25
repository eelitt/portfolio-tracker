/**
 * Holding card logo paths (public/holdings/logos/…).
 * Convention only — missing files are hidden at runtime (no placeholder).
 */

import type { AssetType } from '@/lib/types'

const LOGO_EXTS = ['svg', 'png'] as const

/**
 * Public URL candidates for a holding logo, preferred order: svg then png.
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

  return LOGO_EXTS.map(
    (ext) => `/holdings/logos/${folder}/${ticker}.${ext}`
  )
}
