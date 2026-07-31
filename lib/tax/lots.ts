/**
 * Lot matching for capital-gains: FIFO and weighted average on TaxableEvent[].
 * No app/DB types here.
 */

import {
  HMO_HOLDING_YEARS_FOR_40,
  HMO_RATE_FROM_10Y,
  HMO_RATE_UNDER_10Y,
} from './finnishRates'
import type {
  ConsumedLotSlice,
  CostMethod,
  Lot,
  MatchedDisposal,
  TaxableEvent,
} from './types'
import { roundMoney } from './progressiveTax'

const QTY_EPS = 1e-12

function sortEvents(events: TaxableEvent[]): TaxableEvent[] {
  return [...events].sort((a, b) => {
    const ta = new Date(a.executedAt).getTime()
    const tb = new Date(b.executedAt).getTime()
    if (ta !== tb) return ta - tb
    // Acquisitions before disposals on same timestamp (stable for tests)
    if (a.type !== b.type) return a.type === 'acquisition' ? -1 : 1
    return a.id.localeCompare(b.id)
  })
}

function yearsBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime()
  const to = new Date(toIso).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0
  // Approximate year length; good enough for 10y HMO boundary in an estimator
  return (to - from) / (365.25 * 24 * 60 * 60 * 1000)
}

/**
 * HMO rate for a disposal: 40% only if every consumed lot slice is ≥ 10 years old
 * at disposal time (conservative when lots are mixed).
 */
export function hmoRateForConsumedLots(
  consumed: ConsumedLotSlice[],
  disposalAt: string
): number {
  if (consumed.length === 0) {
    return HMO_RATE_UNDER_10Y
  }
  const allLong = consumed.every(
    (c) => yearsBetween(c.acquiredAt, disposalAt) >= HMO_HOLDING_YEARS_FOR_40
  )
  return allLong ? HMO_RATE_FROM_10Y : HMO_RATE_UNDER_10Y
}

export function hmoRateFromOldestAcquisition(
  oldestAcquiredAt: string | null,
  disposalAt: string
): number {
  if (!oldestAcquiredAt) return HMO_RATE_UNDER_10Y
  return yearsBetween(oldestAcquiredAt, disposalAt) >= HMO_HOLDING_YEARS_FOR_40
    ? HMO_RATE_FROM_10Y
    : HMO_RATE_UNDER_10Y
}

export type MatchResult = {
  disposalsMatched: MatchedDisposal[]
  openLotsByAsset: Map<string, Lot[]>
}

function matchFifo(events: TaxableEvent[]): MatchResult {
  const lotsByAsset = new Map<string, Lot[]>()
  const disposalsMatched: MatchedDisposal[] = []

  for (const ev of sortEvents(events)) {
    if (ev.type === 'acquisition') {
      const lots = lotsByAsset.get(ev.assetKey) ?? []
      lots.push({
        quantity: ev.quantity,
        unitCostEur: ev.unitPriceEur,
        acquiredAt: ev.executedAt,
        source: ev.source,
        costKnown: ev.costKnown !== false,
      })
      lotsByAsset.set(ev.assetKey, lots)
      continue
    }

    // disposal
    const lots = lotsByAsset.get(ev.assetKey) ?? []
    let remaining = ev.quantity
    const consumed: ConsumedLotSlice[] = []
    let quantityCapped = false

    while (remaining > QTY_EPS && lots.length > 0) {
      const lot = lots[0]
      const take = Math.min(lot.quantity, remaining)
      consumed.push({
        quantity: take,
        unitCostEur: lot.unitCostEur,
        acquiredAt: lot.acquiredAt,
        costEur: take * lot.unitCostEur,
        costKnown: lot.costKnown,
      })
      lot.quantity -= take
      remaining -= take
      if (lot.quantity <= QTY_EPS) {
        lots.shift()
      }
    }

    if (remaining > QTY_EPS) {
      quantityCapped = true
    }

    const soldQty = ev.quantity - Math.max(0, remaining)
    if (soldQty <= QTY_EPS) {
      // Nothing to match — still record zero-cost unreliable disposal for visibility
      disposalsMatched.push({
        disposalEventId: ev.id,
        assetKey: ev.assetKey,
        assetClass: ev.assetClass,
        quantity: 0,
        proceedsEur: 0,
        feeEur: ev.feeEur ?? 0,
        executedAt: ev.executedAt,
        actualCostEur: 0,
        costBasisReliable: false,
        hmoRate: HMO_RATE_UNDER_10Y,
        consumedLots: [],
        method: 'fifo',
        quantityCapped: true,
      })
      continue
    }

    const proceedsEur = soldQty * ev.unitPriceEur
    const actualCostEur = consumed.reduce((s, c) => s + c.costEur, 0)
    const costBasisReliable =
      consumed.length > 0 && consumed.every((c) => c.costKnown) && !quantityCapped

    disposalsMatched.push({
      disposalEventId: ev.id,
      assetKey: ev.assetKey,
      assetClass: ev.assetClass,
      quantity: soldQty,
      proceedsEur,
      feeEur: ev.feeEur ?? 0,
      executedAt: ev.executedAt,
      actualCostEur,
      costBasisReliable,
      hmoRate: hmoRateForConsumedLots(consumed, ev.executedAt),
      consumedLots: consumed,
      method: 'fifo',
      quantityCapped,
    })
  }

  return { disposalsMatched, openLotsByAsset: lotsByAsset }
}

type AvgState = {
  quantity: number
  totalCostEur: number
  oldestAcquiredAt: string | null
  costKnown: boolean
}

function matchWeightedAverage(events: TaxableEvent[]): MatchResult {
  const stateByAsset = new Map<string, AvgState>()
  const disposalsMatched: MatchedDisposal[] = []

  for (const ev of sortEvents(events)) {
    if (ev.type === 'acquisition') {
      const st = stateByAsset.get(ev.assetKey) ?? {
        quantity: 0,
        totalCostEur: 0,
        oldestAcquiredAt: null as string | null,
        costKnown: true,
      }
      if (st.quantity <= QTY_EPS) {
        st.oldestAcquiredAt = ev.executedAt
        st.costKnown = ev.costKnown !== false
      } else {
        st.costKnown = st.costKnown && ev.costKnown !== false
      }
      st.quantity += ev.quantity
      st.totalCostEur += ev.quantity * ev.unitPriceEur
      stateByAsset.set(ev.assetKey, st)
      continue
    }

    const st = stateByAsset.get(ev.assetKey) ?? {
      quantity: 0,
      totalCostEur: 0,
      oldestAcquiredAt: null as string | null,
      costKnown: true,
    }

    let soldQty = ev.quantity
    let quantityCapped = false
    if (soldQty > st.quantity + QTY_EPS) {
      soldQty = st.quantity
      quantityCapped = true
    }

    if (soldQty <= QTY_EPS || st.quantity <= QTY_EPS) {
      disposalsMatched.push({
        disposalEventId: ev.id,
        assetKey: ev.assetKey,
        assetClass: ev.assetClass,
        quantity: 0,
        proceedsEur: 0,
        feeEur: ev.feeEur ?? 0,
        executedAt: ev.executedAt,
        actualCostEur: 0,
        costBasisReliable: false,
        hmoRate: HMO_RATE_UNDER_10Y,
        consumedLots: [],
        method: 'weighted_average',
        quantityCapped: true,
      })
      continue
    }

    const avgCost = st.totalCostEur / st.quantity
    const actualCostEur = soldQty * avgCost
    const proceedsEur = soldQty * ev.unitPriceEur
    const oldest = st.oldestAcquiredAt
    const costKnownBefore = st.costKnown
    const consumed: ConsumedLotSlice[] = oldest
      ? [
          {
            quantity: soldQty,
            unitCostEur: avgCost,
            acquiredAt: oldest,
            costEur: actualCostEur,
            costKnown: costKnownBefore,
          },
        ]
      : []

    st.quantity -= soldQty
    st.totalCostEur -= actualCostEur
    if (st.quantity <= QTY_EPS) {
      st.quantity = 0
      st.totalCostEur = 0
      st.oldestAcquiredAt = null
      st.costKnown = true
    }
    stateByAsset.set(ev.assetKey, st)

    disposalsMatched.push({
      disposalEventId: ev.id,
      assetKey: ev.assetKey,
      assetClass: ev.assetClass,
      quantity: soldQty,
      proceedsEur,
      feeEur: ev.feeEur ?? 0,
      executedAt: ev.executedAt,
      actualCostEur,
      costBasisReliable: costKnownBefore && consumed.length > 0 && !quantityCapped,
      hmoRate: hmoRateFromOldestAcquisition(oldest, ev.executedAt),
      consumedLots: consumed,
      method: 'weighted_average',
      quantityCapped,
    })
  }

  // Represent open inventory as synthetic single lots for openLotsByAsset
  const openLotsByAsset = new Map<string, Lot[]>()
  for (const [assetKey, st] of stateByAsset) {
    if (st.quantity > QTY_EPS && st.oldestAcquiredAt) {
      openLotsByAsset.set(assetKey, [
        {
          quantity: st.quantity,
          unitCostEur: st.totalCostEur / st.quantity,
          acquiredAt: st.oldestAcquiredAt,
          costKnown: st.costKnown,
        },
      ])
    }
  }

  return { disposalsMatched, openLotsByAsset }
}

/**
 * Build lots and match all disposals using FIFO or weighted average.
 */
export function buildLotsAndMatchDisposals(
  events: TaxableEvent[],
  method: CostMethod
): MatchResult {
  if (method === 'fifo') return matchFifo(events)
  return matchWeightedAverage(events)
}

export function summarizeOpenLotsFifo(
  openLotsByAsset: Map<string, Lot[]>
): Array<{ assetKey: string; quantity: number; oldestAcquiredAt: string | null }> {
  const out: Array<{ assetKey: string; quantity: number; oldestAcquiredAt: string | null }> = []
  for (const [assetKey, lots] of openLotsByAsset) {
    const quantity = lots.reduce((s, l) => s + l.quantity, 0)
    if (quantity <= QTY_EPS) continue
    const oldestAcquiredAt =
      lots.length > 0
        ? lots.reduce(
            (min, l) => (min === null || l.acquiredAt < min ? l.acquiredAt : min),
            null as string | null
          )
        : null
    out.push({ assetKey, quantity: Number(quantity.toFixed(8)), oldestAcquiredAt })
  }
  out.sort((a, b) => a.assetKey.localeCompare(b.assetKey))
  return out
}

export function summarizeOpenLotsAvg(
  openLotsByAsset: Map<string, Lot[]>
): Array<{
  assetKey: string
  quantity: number
  avgCostEur: number
  oldestAcquiredAt: string | null
}> {
  const out: Array<{
    assetKey: string
    quantity: number
    avgCostEur: number
    oldestAcquiredAt: string | null
  }> = []
  for (const [assetKey, lots] of openLotsByAsset) {
    const quantity = lots.reduce((s, l) => s + l.quantity, 0)
    if (quantity <= QTY_EPS) continue
    const totalCost = lots.reduce((s, l) => s + l.quantity * l.unitCostEur, 0)
    const oldestAcquiredAt =
      lots.length > 0
        ? lots.reduce(
            (min, l) => (min === null || l.acquiredAt < min ? l.acquiredAt : min),
            null as string | null
          )
        : null
    out.push({
      assetKey,
      quantity: Number(quantity.toFixed(8)),
      avgCostEur: roundMoney(totalCost / quantity),
      oldestAcquiredAt,
    })
  }
  out.sort((a, b) => a.assetKey.localeCompare(b.assetKey))
  return out
}
