/**
 * Unit tests for tax brief / summary helpers (orchestrator-facing).
 */

import { describe, it, expect } from 'vitest'
import { buildTaxBrief, buildTaxSummary } from '../tax/buildTaxBrief'
import type { FinnishTaxEstimateResult } from '../tax'

function minimalResult(
  overrides: Partial<FinnishTaxEstimateResult> = {}
): FinnishTaxEstimateResult {
  const method = {
    method: 'fifo' as const,
    disposals: [
      {
        disposalEventId: 'd1',
        assetKey: 'BTC',
        quantity: 1,
        proceedsEur: 50_000,
        actualCostEur: 30_000,
        feeEur: 0,
        hmoRate: 0.2,
        hmoAmountEur: 10_000,
        gainIfActualEur: 20_000,
        gainIfHmoEur: 40_000,
        taxableGainOrLossEur: 20_000,
        basisUsed: 'actual' as const,
        costBasisReliable: true,
        holdingPeriodNote: '',
      },
    ],
    totalProceedsEur: 50_000,
    totalActualCostEur: 30_000,
    totalTaxableGainEur: 20_000,
    totalTaxableLossEur: 0,
    netGainOrLossEur: 20_000,
    taxableBaseEur: 20_000,
    estimatedTaxEur: 6000,
    effectiveRateOnBase: 0.3,
    usedHmoOnAnyDisposal: false,
    notes: [],
  }

  return {
    currency: 'EUR',
    taxYear: 2026,
    mode: 'ytd',
    ratesYearLabel: '2025 rates (example)',
    otherCapitalIncomeEur: 0,
    methods: {
      fifo: method,
      weightedAverage: {
        ...method,
        method: 'weighted_average',
        estimatedTaxEur: 6500,
        taxableBaseEur: 21_000,
      },
    },
    comparison: {
      cheaperMethod: 'fifo',
      taxDeltaEur: 500,
      notes: [],
    },
    smallDisposal: {
      totalProceedsInScopeEur: 50_000,
      thresholdEur: 1000,
      mayBeTaxFree: false,
      note: '',
    },
    eventsSummary: { count: 1, sources: ['app_transaction'] },
    yearEndNotes: [],
    assumptions: [],
    disclaimers: [],
    openLotsAfter: { fifo: [], weightedAverage: [] },
    ...overrides,
  }
}

describe('buildTaxBrief', () => {
  it('includes both methods and estimate-only disclaimer', () => {
    const brief = buildTaxBrief(minimalResult())
    expect(brief).toMatch(/FIFO/)
    expect(brief).toMatch(/Weighted average/i)
    expect(brief).toMatch(/Lower estimated tax: FIFO/)
    expect(brief).toMatch(/Estimate only/)
    expect(brief.toLowerCase()).not.toMatch(/cache/)
  })

  it('notes empty disposals', () => {
    const r = minimalResult()
    r.methods.fifo.disposals = []
    r.methods.weightedAverage.disposals = []
    const brief = buildTaxBrief(r)
    expect(brief).toMatch(/No disposals/i)
  })
})

describe('buildTaxSummary', () => {
  it('returns compact numbers without full disposals', () => {
    const s = buildTaxSummary(minimalResult())
    expect(s.fifo.estimatedTaxEur).toBe(6000)
    expect(s.comparison.lowerTaxMethod).toBe('fifo')
    expect(s.disposalCount).toBe(1)
  })
})
