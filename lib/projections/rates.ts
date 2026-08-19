import { ALLOC_ASSET_TYPES, type TypeWeightMap } from '@/lib/allocationTargets'
import { getCryptoPricing } from '@/lib/symbols'
import type { AssumptionPack, ReturnSlice, TypeRates } from './types'

/** Documented nominal annual rates (not fetched). */
export const FIXED_TYPE_RATES = {
  stock: 0.08,
  etf: 0.08,
  cash: 0,
} as const

/** Stress the blended r down by this much for the popover sensitivity line. */
export const RETURN_STRESS_PP = 0.02

/** Used when the shared BTC assumption is missing. */
export const CRYPTO_RATE_FALLBACK = 0.06

/** Pegged stables do not get a crypto historic rate. */
export const STABLE_RATE = 0

/** Discard a coin’s own CAGR below this many years of Yahoo history. */
export const MIN_CRYPTO_HISTORY_YEARS = 5

export function isStableCrypto(symbol: string): boolean {
  return getCryptoPricing(symbol).kind === 'stable'
}

export function usedCryptoRates(pack: AssumptionPack): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of pack.coins) {
    if (c.status === 'used' && c.planningRate != null) {
      out[c.symbol.toUpperCase()] = c.planningRate
    }
  }
  return out
}

export function rateForSlice(
  slice: ReturnSlice,
  cryptoRates: Record<string, number>,
  fallbackCrypto: number
): number {
  if (slice.assetType === 'stock' || slice.assetType === 'etf') {
    return FIXED_TYPE_RATES.stock
  }
  if (slice.assetType === 'cash') return FIXED_TYPE_RATES.cash
  if (slice.assetType === 'crypto') {
    if (isStableCrypto(slice.symbol)) return STABLE_RATE
    const own = cryptoRates[slice.symbol.toUpperCase()]
    return Number.isFinite(own) ? own : fallbackCrypto
  }
  return FIXED_TYPE_RATES.cash
}

/**
 * Blended nominal annual r from current position market values.
 * Empty / unpriced book → cash rate.
 */
export function expectedReturnFromSlices(
  slices: ReturnSlice[],
  cryptoRates: Record<string, number>,
  fallbackCrypto: number
): number {
  let mv = 0
  let acc = 0
  for (const s of slices) {
    const v = Number(s.marketValue) || 0
    if (!(v > 0)) continue
    mv += v
    acc += v * rateForSlice(s, cryptoRates, fallbackCrypto)
  }
  if (!(mv > 0)) return FIXED_TYPE_RATES.cash
  return acc / mv
}

export function typeRatesFromCrypto(cryptoRate: number): TypeRates {
  const crypto = Number.isFinite(cryptoRate) ? cryptoRate : CRYPTO_RATE_FALLBACK
  return {
    stock: FIXED_TYPE_RATES.stock,
    etf: FIXED_TYPE_RATES.etf,
    crypto,
    cash: FIXED_TYPE_RATES.cash,
  }
}

/**
 * Blended nominal annual r from type weights (0–100) × type rates.
 * Zero-sum weights → cash rate (empty book).
 */
export function expectedReturnFromMix(
  weights: TypeWeightMap,
  cryptoRate: number
): number {
  const rates = typeRatesFromCrypto(cryptoRate)
  let wSum = 0
  let acc = 0
  for (const t of ALLOC_ASSET_TYPES) {
    const w = Number(weights[t]) || 0
    if (w <= 0) continue
    wSum += w
    acc += w * rates[t]
  }
  if (!(wSum > 0)) return rates.cash
  return acc / wSum
}

/** Actual type mix from market values (same units). */
export function weightsFromMarketValues(
  byType: Partial<Record<keyof TypeWeightMap, number>>
): TypeWeightMap {
  const raw: TypeWeightMap = { stock: 0, etf: 0, crypto: 0, cash: 0 }
  let sum = 0
  for (const t of ALLOC_ASSET_TYPES) {
    const v = Number(byType[t]) || 0
    if (v > 0) {
      raw[t] = v
      sum += v
    }
  }
  if (!(sum > 0)) return raw
  for (const t of ALLOC_ASSET_TYPES) {
    raw[t] = (raw[t] / sum) * 100
  }
  return raw
}
