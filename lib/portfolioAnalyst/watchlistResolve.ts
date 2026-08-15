/**
 * Resolve a free-text watchlist query against the catalog.
 * Does not loosen trade resolution (resolveCatalogSymbol stays exact).
 */

import type { AssetType } from '../types'
import {
  CRYPTO_SYMBOLS,
  ETF_SYMBOLS,
  STOCK_SYMBOLS,
  getSymbolsForType,
} from '../symbols'
import { resolveCatalogSymbol } from './chatAddTransaction'

export type WatchlistAssetType = 'stock' | 'etf' | 'crypto'

export type WatchlistCandidate = {
  symbol: string
  assetType: WatchlistAssetType
  name: string
}

export type ResolveWatchlistQueryResult =
  | { ok: true; symbol: string; assetType: WatchlistAssetType; name: string }
  | { ok: false; error: string; failureMode: 'catalog_unknown' | 'catalog_ambiguous' | 'validation_invalid'; candidates?: WatchlistCandidate[] }

const FILLER = new Set([
  'add',
  'added',
  'adding',
  'remove',
  'removed',
  'removing',
  'delete',
  'deleted',
  'from',
  'to',
  'the',
  'a',
  'an',
  'my',
  'please',
  'watchlist',
  'watch',
  'watching',
  'item',
  'items',
  'token',
  'tokens',
  'coin',
  'coins',
  'stock',
  'stocks',
  'share',
  'shares',
  'etf',
  'etfs',
  'crypto',
  'cryptos',
  'inc',
  'ltd',
  'corp',
  'corporation',
  'company',
  'co',
])

type CatalogEntry = WatchlistCandidate

function catalogPool(): CatalogEntry[] {
  const pool: CatalogEntry[] = []
  for (const s of STOCK_SYMBOLS) {
    pool.push({
      symbol: s.symbol.toUpperCase(),
      assetType: 'stock',
      name: s.name,
    })
  }
  for (const s of ETF_SYMBOLS) {
    pool.push({
      symbol: s.symbol.toUpperCase(),
      assetType: 'etf',
      name: s.name,
    })
  }
  for (const s of CRYPTO_SYMBOLS) {
    pool.push({
      symbol: s.symbol.toUpperCase(),
      assetType: 'crypto',
      name: s.name,
    })
  }
  return pool
}

function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Remaining query after dropping command/filler words. */
export function stripWatchlistFiller(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.\-\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !FILLER.has(t))
    .join(' ')
}

export function isWatchableCatalogSymbol(
  symbol: string,
  assetType: WatchlistAssetType
): boolean {
  const upper = symbol.trim().toUpperCase()
  if (!upper) return false
  return getSymbolsForType(assetType).some((s) => s.symbol.toUpperCase() === upper)
}

export function openHoldingKey(
  symbol: string,
  assetType: string
): string {
  return `${assetType}:${symbol.trim().toUpperCase()}`
}

/** Open non-cash positions (qty > 0), keyed like watchlist uniqueness. */
export function openHoldingKeys(
  holdings: Array<{ symbol: string; asset_type: string; quantity: number }>
): Set<string> {
  const keys = new Set<string>()
  for (const h of holdings) {
    if (h.asset_type === 'cash' || !(h.quantity > 0)) continue
    keys.add(openHoldingKey(h.symbol, h.asset_type))
  }
  return keys
}

export function catalogNameFor(
  symbol: string,
  assetType: WatchlistAssetType
): string {
  const hit = getSymbolsForType(assetType).find(
    (s) => s.symbol.toUpperCase() === symbol.trim().toUpperCase()
  )
  return hit?.name ?? symbol
}

function asWatchlistType(
  assetType: AssetType
): WatchlistAssetType | null {
  if (assetType === 'stock' || assetType === 'etf' || assetType === 'crypto') {
    return assetType
  }
  return null
}

function uniqueOrAmbiguous(
  hits: CatalogEntry[],
  query: string
): ResolveWatchlistQueryResult {
  const deduped = new Map<string, CatalogEntry>()
  for (const h of hits) {
    deduped.set(`${h.assetType}:${h.symbol}`, h)
  }
  const list = [...deduped.values()]
  if (list.length === 1) {
    return {
      ok: true,
      symbol: list[0].symbol,
      assetType: list[0].assetType,
      name: list[0].name,
    }
  }
  if (list.length === 0) {
    return {
      ok: false,
      error: `No catalog symbol matches "${query}". Pick a stock, ETF, or crypto from the lists.`,
      failureMode: 'catalog_unknown',
    }
  }
  return {
    ok: false,
    error: `"${query}" matches more than one symbol. Use the ticker.`,
    failureMode: 'catalog_ambiguous',
    candidates: list.slice(0, 8),
  }
}

/**
 * Map user text (ticker, name, or "add apple to the watchlist") to one catalog row.
 */
export function resolveWatchlistQuery(raw: string): ResolveWatchlistQueryResult {
  const trimmed = (raw || '').trim()
  if (!trimmed) {
    return {
      ok: false,
      error: 'Say which symbol to watch (ticker or name).',
      failureMode: 'validation_invalid',
    }
  }

  const remainder = stripWatchlistFiller(trimmed)
  if (!remainder) {
    return {
      ok: false,
      error: 'Say which symbol to watch (ticker or name).',
      failureMode: 'validation_invalid',
    }
  }

  const exact = resolveCatalogSymbol(remainder)
  if (exact && 'symbol' in exact) {
    const wt = asWatchlistType(exact.assetType)
    if (!wt) {
      return {
        ok: false,
        error: 'Cash cannot be added to the watchlist.',
        failureMode: 'validation_invalid',
      }
    }
    return {
      ok: true,
      symbol: exact.symbol,
      assetType: wt,
      name: catalogNameFor(exact.symbol, wt),
    }
  }
  if (exact && 'error' in exact) {
    return {
      ok: false,
      error: exact.error,
      failureMode: 'catalog_ambiguous',
    }
  }

  const q = remainder.toLowerCase()
  if (q.length < 2) {
    return {
      ok: false,
      error: 'Say which symbol to watch (ticker or name).',
      failureMode: 'validation_invalid',
    }
  }

  const pool = catalogPool()
  const hits = pool.filter((e) => {
    if (e.symbol.toLowerCase() === q) return true
    if (e.name.toLowerCase() === q) return true
    return nameWords(e.name).includes(q)
  })

  return uniqueOrAmbiguous(hits, remainder)
}
