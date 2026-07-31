/**
 * Finnish capital-gains estimate on TaxableEvent[] (EUR).
 * Dual method (FIFO + weighted average), HMO compare, progressive tax, light notes.
 */

import {
  DEFAULT_DISCLAIMERS,
  FINNISH_TAX_RATES_YEAR_LABEL,
  HMO_HOLDING_YEARS_FOR_40,
  SMALL_DISPOSAL_PROCEEDS_THRESHOLD_EUR,
} from './finnishRates'
import {
  buildLotsAndMatchDisposals,
  summarizeOpenLotsAvg,
  summarizeOpenLotsFifo,
} from './lots'
import { estimateProgressiveCapitalTax, roundMoney } from './progressiveTax'
import type {
  CostMethod,
  DisposalTaxLine,
  FinnishTaxEstimateInput,
  FinnishTaxEstimateResult,
  MatchedDisposal,
  MethodBreakdown,
  TaxableEvent,
  TaxEventSource,
} from './types'

const HYPOTHETICAL_ID_PREFIX = 'hypothetical-disposal:'

function calendarYear(iso: string): number {
  return new Date(iso).getUTCFullYear()
}

function yearsBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime()
  const to = new Date(toIso).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0
  return (to - from) / (365.25 * 24 * 60 * 60 * 1000)
}

/**
 * Apply actual-cost vs hankintameno-olettama rules for one matched disposal.
 * Losses: actual only (HMO never used to create a gain from a loss).
 * Gains: choose the lower taxable gain (higher deductible basis).
 */
export function applyHmoVsActual(m: MatchedDisposal, isHypothetical = false): DisposalTaxLine {
  const proceedsEur = roundMoney(m.proceedsEur)
  const actualCostEur = roundMoney(m.actualCostEur)
  const feeEur = roundMoney(m.feeEur)
  const hmoAmountEur = roundMoney(proceedsEur * m.hmoRate)
  const gainIfActualEur = roundMoney(proceedsEur - actualCostEur - feeEur)
  const gainIfHmoEur = roundMoney(proceedsEur - hmoAmountEur)

  let taxableGainOrLossEur: number
  let basisUsed: DisposalTaxLine['basisUsed']
  let holdingPeriodNote: string

  if (!m.costBasisReliable || m.quantity <= 0) {
    // Unknown / no inventory: HMO primary when there are proceeds
    if (proceedsEur > 0) {
      taxableGainOrLossEur = gainIfHmoEur
      basisUsed = 'hmo'
      holdingPeriodNote = `Cost basis unreliable or missing — hankintameno-olettama ${(m.hmoRate * 100).toFixed(0)}% applied.`
    } else {
      taxableGainOrLossEur = 0
      basisUsed = 'none'
      holdingPeriodNote = 'No matched quantity for disposal.'
    }
  } else if (gainIfActualEur <= 0) {
    taxableGainOrLossEur = gainIfActualEur
    basisUsed = 'actual'
    holdingPeriodNote =
      'Actual cost produces a loss or zero — hankintameno-olettama not applied (would not create a deductible loss benefit here).'
  } else if (gainIfHmoEur < gainIfActualEur) {
    taxableGainOrLossEur = gainIfHmoEur
    basisUsed = 'hmo'
    holdingPeriodNote = `Hankintameno-olettama ${(m.hmoRate * 100).toFixed(0)}% more favorable than actual cost.`
  } else {
    taxableGainOrLossEur = gainIfActualEur
    basisUsed = 'actual'
    holdingPeriodNote = `Actual cost more favorable than ${(m.hmoRate * 100).toFixed(0)}% hankintameno-olettama.`
  }

  if (m.hmoRate >= 0.4) {
    holdingPeriodNote += ' Holding period rule: all matched lots ≥ 10 years (40% HMO).'
  } else {
    holdingPeriodNote += ' Holding period rule: not all matched lots ≥ 10 years (20% HMO).'
  }

  return {
    disposalEventId: m.disposalEventId,
    assetKey: m.assetKey,
    quantity: m.quantity,
    proceedsEur,
    actualCostEur,
    feeEur,
    hmoRate: m.hmoRate,
    hmoAmountEur,
    gainIfActualEur,
    gainIfHmoEur,
    taxableGainOrLossEur,
    basisUsed,
    costBasisReliable: m.costBasisReliable,
    holdingPeriodNote,
    isHypothetical,
  }
}

function filterDisposalsForMode(
  matched: MatchedDisposal[],
  taxYear: number,
  mode: FinnishTaxEstimateInput['mode'],
  hypotheticalId: string | null
): MatchedDisposal[] {
  return matched.filter((m) => {
    if (m.quantity <= 0 && m.proceedsEur <= 0) return false
    const y = calendarYear(m.executedAt)
    if (y !== taxYear) return false
    const isHypo = hypotheticalId !== null && m.disposalEventId === hypotheticalId
    if (mode === 'hypothetical_sell') return isHypo
    if (mode === 'ytd') return !isHypo
    // full: real YTD + hypothetical if in year
    return true
  })
}

function buildMethodBreakdown(
  matchedInScope: MatchedDisposal[],
  method: CostMethod,
  otherCapitalIncomeEur: number,
  smallDisposalMayBeTaxFree: boolean
): MethodBreakdown {
  const notes: string[] = []
  const disposals = matchedInScope.map((m) => {
    if (m.quantityCapped) {
      notes.push(`Quantity capped to open inventory for ${m.assetKey} (${method}).`)
    }
    const isHypo = m.disposalEventId.startsWith(HYPOTHETICAL_ID_PREFIX)
    return applyHmoVsActual(m, isHypo)
  })

  const totalProceedsEur = roundMoney(disposals.reduce((s, d) => s + d.proceedsEur, 0))
  const totalActualCostEur = roundMoney(disposals.reduce((s, d) => s + d.actualCostEur, 0))

  let totalTaxableGainEur = 0
  let totalTaxableLossEur = 0
  for (const d of disposals) {
    if (d.taxableGainOrLossEur > 0) totalTaxableGainEur += d.taxableGainOrLossEur
    else if (d.taxableGainOrLossEur < 0) totalTaxableLossEur += d.taxableGainOrLossEur
  }
  totalTaxableGainEur = roundMoney(totalTaxableGainEur)
  totalTaxableLossEur = roundMoney(totalTaxableLossEur)
  const netGainOrLossEur = roundMoney(totalTaxableGainEur + totalTaxableLossEur)

  let taxableBaseEur = Math.max(0, netGainOrLossEur)
  if (smallDisposalMayBeTaxFree && taxableBaseEur > 0) {
    taxableBaseEur = 0
    notes.push(
      'Small-disposal rule: known proceeds in scope ≤ €1,000 — estimated taxable gain set to 0 (verify all disposals that year).'
    )
  }

  const { taxEur, effectiveRate } = estimateProgressiveCapitalTax(
    taxableBaseEur,
    otherCapitalIncomeEur
  )

  const usedHmoOnAnyDisposal = disposals.some((d) => d.basisUsed === 'hmo')

  return {
    method,
    disposals,
    totalProceedsEur,
    totalActualCostEur,
    totalTaxableGainEur,
    totalTaxableLossEur,
    netGainOrLossEur,
    taxableBaseEur,
    estimatedTaxEur: taxEur,
    effectiveRateOnBase: effectiveRate,
    usedHmoOnAnyDisposal,
    notes,
  }
}

function appendHypothetical(
  events: TaxableEvent[],
  hypothetical: NonNullable<FinnishTaxEstimateInput['hypothetical']>
): { events: TaxableEvent[]; hypotheticalId: string } {
  const executedAt = hypothetical.executedAt ?? new Date().toISOString()
  const hypotheticalId = `${HYPOTHETICAL_ID_PREFIX}${hypothetical.assetKey}:${executedAt}`
  const event: TaxableEvent = {
    id: hypotheticalId,
    assetKey: hypothetical.assetKey.toUpperCase(),
    assetClass: hypothetical.assetClass ?? 'crypto',
    type: 'disposal',
    quantity: hypothetical.quantity,
    unitPriceEur: hypothetical.unitPriceEur,
    executedAt,
    feeEur: hypothetical.feeEur ?? 0,
    source: { kind: 'manual' },
    costKnown: true,
    notes: 'Hypothetical disposal (not recorded)',
  }
  return { events: [...events, event], hypotheticalId }
}

function collectSourceKinds(events: TaxableEvent[]): Array<TaxEventSource['kind']> {
  const set = new Set<TaxEventSource['kind']>()
  for (const e of events) set.add(e.source.kind)
  return [...set].sort()
}

function buildYearEndNotes(
  events: TaxableEvent[],
  taxYear: number,
  fifoBreakdown: MethodBreakdown,
  openFifo: FinnishTaxEstimateResult['openLotsAfter']['fifo']
): string[] {
  const notes: string[] = []
  const asOf = `${taxYear}-12-31T23:59:59.000Z`

  if (fifoBreakdown.netGainOrLossEur > 0) {
    // Unrealized losses: open lots vs — we only know cost, not mark; skip price-based unless we have marks
    notes.push(
      'You have a positive estimated net disposal result this year under FIFO; unrealized losses on other positions (if any) might offset gains if realized — not advice.'
    )
  }

  for (const pos of openFifo) {
    if (!pos.oldestAcquiredAt) continue
    const age = yearsBetween(pos.oldestAcquiredAt, asOf)
    if (age >= HMO_HOLDING_YEARS_FOR_40 - 1 && age < HMO_HOLDING_YEARS_FOR_40) {
      notes.push(
        `${pos.assetKey}: oldest open lot is near 10 years — 40% hankintameno-olettama may become available after the 10-year holding period.`
      )
    }
  }

  const realDisposalsThisYear = events.filter(
    (e) =>
      e.type === 'disposal' &&
      !e.id.startsWith(HYPOTHETICAL_ID_PREFIX) &&
      calendarYear(e.executedAt) === taxYear
  )
  const proceeds = realDisposalsThisYear.reduce((s, e) => s + e.quantity * e.unitPriceEur, 0)
  if (proceeds > 0 && proceeds <= SMALL_DISPOSAL_PROCEEDS_THRESHOLD_EUR * 1.5) {
    notes.push(
      'Known disposal proceeds are near the €1,000 small-disposal threshold — additional sales can change tax treatment of the whole year.'
    )
  }

  const taxDelta =
    Math.abs(
      fifoBreakdown.estimatedTaxEur -
        // placeholder compared later; year-end still useful without avg here
        fifoBreakdown.estimatedTaxEur
    )
  void taxDelta

  if (fifoBreakdown.usedHmoOnAnyDisposal) {
    notes.push('At least one disposal used hankintameno-olettama under FIFO in this estimate.')
  }

  return notes
}

/**
 * Estimate Finnish capital-gains tax for a set of EUR-normalized taxable events.
 */
export function estimateFinnishCapitalGains(
  input: FinnishTaxEstimateInput
): FinnishTaxEstimateResult {
  const otherCapitalIncomeEur = Math.max(0, input.otherCapitalIncomeEur ?? 0)
  const assumptions: string[] = [
    `Tax year ${input.taxYear}`,
    `Other capital income assumed €${roundMoney(otherCapitalIncomeEur)} (optional input; default 0)`,
    'All event amounts treated as EUR',
    'Dual methods: FIFO and weighted average; each compared to hankintameno-olettama when beneficial',
    `Rates: ${FINNISH_TAX_RATES_YEAR_LABEL}`,
  ]

  let workingEvents = [...input.events]
  let hypotheticalId: string | null = null

  if (input.mode === 'hypothetical_sell' || input.mode === 'full') {
    if (!input.hypothetical) {
      if (input.mode === 'hypothetical_sell') {
        assumptions.push('No hypothetical disposal provided — empty hypothetical result.')
      }
    } else {
      if (!(input.hypothetical.quantity > 0) || !(input.hypothetical.unitPriceEur >= 0)) {
        throw new Error('Hypothetical disposal requires quantity > 0 and unitPriceEur ≥ 0.')
      }
      const appended = appendHypothetical(workingEvents, input.hypothetical)
      workingEvents = appended.events
      hypotheticalId = appended.hypotheticalId
      assumptions.push(
        `Includes hypothetical disposal of ${input.hypothetical.quantity} ${input.hypothetical.assetKey} @ €${input.hypothetical.unitPriceEur}/unit`
      )
    }
  }

  const fifoMatch = buildLotsAndMatchDisposals(workingEvents, 'fifo')
  const avgMatch = buildLotsAndMatchDisposals(workingEvents, 'weighted_average')

  const fifoInScope = filterDisposalsForMode(
    fifoMatch.disposalsMatched,
    input.taxYear,
    input.mode,
    hypotheticalId
  )
  const avgInScope = filterDisposalsForMode(
    avgMatch.disposalsMatched,
    input.taxYear,
    input.mode,
    hypotheticalId
  )

  // Small-disposal uses proceeds from in-scope disposals (same set conceptually for both methods)
  const totalProceedsInScopeEur = roundMoney(
    fifoInScope.reduce((s, m) => s + m.proceedsEur, 0)
  )
  const mayBeTaxFree =
    totalProceedsInScopeEur > 0 &&
    totalProceedsInScopeEur <= SMALL_DISPOSAL_PROCEEDS_THRESHOLD_EUR

  const fifoBreakdown = buildMethodBreakdown(
    fifoInScope,
    'fifo',
    otherCapitalIncomeEur,
    mayBeTaxFree
  )
  const avgBreakdown = buildMethodBreakdown(
    avgInScope,
    'weighted_average',
    otherCapitalIncomeEur,
    mayBeTaxFree
  )

  const taxDeltaEur = roundMoney(
    Math.abs(fifoBreakdown.estimatedTaxEur - avgBreakdown.estimatedTaxEur)
  )
  let cheaperMethod: FinnishTaxEstimateResult['comparison']['cheaperMethod'] = 'tie'
  if (fifoBreakdown.estimatedTaxEur < avgBreakdown.estimatedTaxEur) cheaperMethod = 'fifo'
  else if (avgBreakdown.estimatedTaxEur < fifoBreakdown.estimatedTaxEur) {
    cheaperMethod = 'weighted_average'
  }

  const comparisonNotes: string[] = []
  if (cheaperMethod === 'tie') {
    comparisonNotes.push('FIFO and weighted average produce the same estimated tax in this run.')
  } else {
    comparisonNotes.push(
      `Lower estimated tax under ${cheaperMethod === 'fifo' ? 'FIFO' : 'weighted average'} (delta €${taxDeltaEur}).`
    )
  }
  if (taxDeltaEur > 0) {
    comparisonNotes.push(
      'Methods diverge when lot costs differ — for crypto, Finnish practice often follows FIFO for actual cost.'
    )
  }

  const openFifo = summarizeOpenLotsFifo(fifoMatch.openLotsByAsset)
  const openAvg = summarizeOpenLotsAvg(avgMatch.openLotsByAsset)

  const yearEndNotes =
    input.mode === 'ytd' || input.mode === 'full'
      ? buildYearEndNotes(workingEvents, input.taxYear, fifoBreakdown, openFifo)
      : []

  // Method divergence note for year-end pack
  if ((input.mode === 'full' || input.mode === 'ytd') && taxDeltaEur >= 1) {
    yearEndNotes.push(
      `FIFO vs weighted-average estimated tax differs by €${taxDeltaEur} in this scope.`
    )
  }

  return {
    currency: 'EUR',
    taxYear: input.taxYear,
    mode: input.mode,
    ratesYearLabel: FINNISH_TAX_RATES_YEAR_LABEL,
    otherCapitalIncomeEur: roundMoney(otherCapitalIncomeEur),
    methods: {
      weightedAverage: avgBreakdown,
      fifo: fifoBreakdown,
    },
    comparison: {
      cheaperMethod,
      taxDeltaEur,
      notes: comparisonNotes,
    },
    smallDisposal: {
      totalProceedsInScopeEur,
      thresholdEur: SMALL_DISPOSAL_PROCEEDS_THRESHOLD_EUR,
      mayBeTaxFree,
      note: mayBeTaxFree
        ? 'Known disposal proceeds in scope ≤ €1,000 — gains may be non-taxable if this covers all disposals that year.'
        : 'Known disposal proceeds in scope exceed €1,000 (or none) — small-disposal exemption not applied.',
    },
    eventsSummary: {
      count: workingEvents.length,
      sources: collectSourceKinds(workingEvents),
    },
    yearEndNotes,
    assumptions,
    disclaimers: [...DEFAULT_DISCLAIMERS],
    openLotsAfter: {
      fifo: openFifo,
      weightedAverage: openAvg,
    },
  }
}
