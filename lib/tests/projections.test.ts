import { describe, expect, it } from 'vitest'
import {
  CRYPTO_RATE_FALLBACK,
  MIN_CRYPTO_HISTORY_YEARS,
  RETURN_STRESS_PP,
  STABLE_RATE,
  assignedPv,
  averageMonthlyUserInflows,
  goalStartingValue,
  evaluateGoal,
  expectedReturnFromMix,
  expectedReturnFromSlices,
  keepContributingSurplus,
  fundingWarning,
  goalStatus,
  isUserCashInflow,
  monthsToTarget,
  monthsUntil,
  planningRateFromCagr,
  priceCagr,
  projectValue,
  requiredMonthly,
  seedMonthlyFromBand,
  suggestTargetDateFromHorizon,
  weightsFromMarketValues,
  yearsBetween,
} from '../projections'
import type { Transaction } from '../types'

describe('priceCagr / planningRateFromCagr', () => {
  it('doubles in one year → 100%', () => {
    expect(priceCagr(100, 200, 1)).toBeCloseTo(1, 10)
  })

  it('rejects non-positive inputs', () => {
    expect(priceCagr(0, 100, 1)).toBeNull()
    expect(priceCagr(100, 200, 0)).toBeNull()
  })

  it('haircuts 2pp and floors at 0 (no cap)', () => {
    expect(planningRateFromCagr(0.68)).toBeCloseTo(0.66, 10)
    expect(planningRateFromCagr(0.01)).toBe(0)
    expect(planningRateFromCagr(0.5)).toBeCloseTo(0.48, 10)
  })

  it('yearsBetween uses 365.25 day years', () => {
    expect(yearsBetween('2014-09-17', '2024-09-17')).toBeCloseTo(10, 2)
    expect(yearsBetween('2024-01-01', '2024-01-01')).toBe(0)
  })
})

describe('projectValue', () => {
  it('zero rate is PV + PMT × n', () => {
    expect(projectValue({ pv: 1000, pmt: 100, annualRate: 0, months: 10 })).toBe(
      2000
    )
  })

  it('zero months returns PV', () => {
    expect(projectValue({ pv: 500, pmt: 99, annualRate: 0.08, months: 0 })).toBe(
      500
    )
  })

  it('grows PV with no contributions', () => {
    const fv = projectValue({ pv: 1000, pmt: 0, annualRate: 0.12, months: 12 })
    expect(fv).toBeCloseTo(1000 * Math.pow(1.01, 12), 8)
  })

  it('ordinary annuity at 12% monthly-equivalent', () => {
    // 1000 growing 12 months at 1%/mo + 100 end-of-month
    const i = 0.01
    const n = 12
    const growth = Math.pow(1 + i, n)
    const expected = 1000 * growth + 100 * ((growth - 1) / i)
    expect(
      projectValue({ pv: 1000, pmt: 100, annualRate: 0.12, months: n })
    ).toBeCloseTo(expected, 8)
  })
})

describe('requiredMonthly', () => {
  it('already at target → 0', () => {
    expect(
      requiredMonthly({ pv: 100, target: 100, annualRate: 0.08, months: 12 })
    ).toBe(0)
  })

  it('zero rate is (target − pv) / n', () => {
    expect(
      requiredMonthly({ pv: 1000, target: 2000, annualRate: 0, months: 10 })
    ).toBe(100)
  })

  it('due now (0 months) is the remaining lump', () => {
    expect(
      requiredMonthly({ pv: 80, target: 100, annualRate: 0.08, months: 0 })
    ).toBe(20)
  })

  it('inverts projectValue', () => {
    const pv = 5000
    const pmt = 250
    const annualRate = 0.08
    const months = 36
    const target = projectValue({ pv, pmt, annualRate, months })
    expect(requiredMonthly({ pv, target, annualRate, months })).toBeCloseTo(
      pmt,
      6
    )
  })

  it('growth alone funds the target → 0', () => {
    expect(
      requiredMonthly({ pv: 1000, target: 1001, annualRate: 0.12, months: 24 })
    ).toBe(0)
  })
})

describe('monthsToTarget', () => {
  it('already funded → 0', () => {
    expect(
      monthsToTarget({ pv: 200, target: 100, pmt: 0, annualRate: 0.08 })
    ).toBe(0)
  })

  it('never if no contribution and no growth', () => {
    expect(
      monthsToTarget({ pv: 100, target: 200, pmt: 0, annualRate: 0 })
    ).toBeNull()
  })

  it('zero rate is ceil leftover / pmt', () => {
    expect(
      monthsToTarget({ pv: 0, target: 1000, pmt: 100, annualRate: 0 })
    ).toBe(10)
  })

  it('inverts projectValue (ceil)', () => {
    const pv = 1000
    const pmt = 50
    const annualRate = 0.06
    const months = 24
    const target = projectValue({ pv, pmt, annualRate, months })
    expect(monthsToTarget({ pv, target, pmt, annualRate })).toBe(months)
  })
})

describe('expectedReturnFromMix', () => {
  it('weights type rates (stock/etf 8%, cash 0%, crypto from arg)', () => {
    const r = expectedReturnFromMix(
      { stock: 50, etf: 0, crypto: 50, cash: 0 },
      0.66
    )
    expect(r).toBeCloseTo(0.5 * 0.08 + 0.5 * 0.66, 10)
  })

  it('more cash lowers r', () => {
    const risky = expectedReturnFromMix(
      { stock: 80, etf: 0, crypto: 0, cash: 20 },
      0.66
    )
    const safer = expectedReturnFromMix(
      { stock: 20, etf: 0, crypto: 0, cash: 80 },
      0.66
    )
    expect(safer).toBeLessThan(risky)
  })

  it('empty mix uses cash rate (0%)', () => {
    expect(
      expectedReturnFromMix({ stock: 0, etf: 0, crypto: 0, cash: 0 }, 0.66)
    ).toBe(0)
  })

  it('fallback crypto rate is 6%', () => {
    expect(CRYPTO_RATE_FALLBACK).toBe(0.06)
  })
})

describe('expectedReturnFromSlices', () => {
  it('weights each position by market value', () => {
    const r = expectedReturnFromSlices(
      [
        { symbol: 'AAPL', assetType: 'stock', marketValue: 50 },
        { symbol: 'ETH', assetType: 'crypto', marketValue: 50 },
      ],
      { ETH: 0.4 },
      0.66
    )
    expect(r).toBeCloseTo(0.5 * 0.08 + 0.5 * 0.4, 10)
  })

  it('stables and cash are 0%, not the crypto fallback', () => {
    const r = expectedReturnFromSlices(
      [
        { symbol: 'USDT', assetType: 'crypto', marketValue: 50 },
        { symbol: 'CASH', assetType: 'cash', marketValue: 50 },
      ],
      {},
      0.66
    )
    expect(STABLE_RATE).toBe(0)
    expect(r).toBe(0)
  })

  it('empty slices use cash rate (0%)', () => {
    expect(expectedReturnFromSlices([], {}, 0.66)).toBe(0)
  })

  it('missing coin uses fallback crypto (BTC), not its own absent rate', () => {
    const r = expectedReturnFromSlices(
      [{ symbol: 'SOL', assetType: 'crypto', marketValue: 100 }],
      {},
      0.66
    )
    expect(r).toBeCloseTo(0.66, 10)
  })

  it('two coins blend by MV', () => {
    const r = expectedReturnFromSlices(
      [
        { symbol: 'BTC', assetType: 'crypto', marketValue: 75 },
        { symbol: 'ETH', assetType: 'crypto', marketValue: 25 },
      ],
      { BTC: 0.5, ETH: 0.2 },
      0.06
    )
    expect(r).toBeCloseTo(0.75 * 0.5 + 0.25 * 0.2, 10)
  })

  it('requires 5 years before a coin rate is eligible (engine constant)', () => {
    expect(MIN_CRYPTO_HISTORY_YEARS).toBe(5)
  })

})

describe('return stress constant', () => {
  it('is 2pp', () => {
    expect(RETURN_STRESS_PP).toBe(0.02)
  })
})

describe('averageMonthlyUserInflows', () => {
  const now = new Date(Date.UTC(2026, 7, 18))

  function tx(partial: Partial<Transaction> & Pick<Transaction, 'executed_at'>): Transaction {
    return {
      symbol: 'Available Cash',
      asset_type: 'cash',
      action: 'inflow',
      quantity: 300,
      unit_price: 1,
      currency: 'EUR',
      ...partial,
    }
  }

  it('ignores sell proceeds and averages 90 days / 3', () => {
    const txs = [
      tx({ executed_at: '2026-07-01', quantity: 300 }),
      tx({ executed_at: '2026-06-01', quantity: 300 }),
      tx({
        executed_at: '2026-07-15',
        quantity: 5000,
        notes: 'Proceeds from SELL 1 ETH @ 5000',
      }),
      tx({ executed_at: '2025-01-01', quantity: 9999 }),
    ]
    expect(isUserCashInflow(txs[2])).toBe(false)
    const r = averageMonthlyUserInflows(txs, 'EUR', 1, now)
    expect(r.monthly).toBeCloseTo(200, 8)
    expect(r.inflowCount).toBe(2)
    const byKey = Object.fromEntries(r.months.map((m) => [m.key, m.amount]))
    expect(byKey['2026-06']).toBe(300)
    expect(byKey['2026-07']).toBe(300)
    expect(byKey['2026-08']).toBe(0)
    expect(r.months.length).toBeGreaterThanOrEqual(3)
  })

  it('counts asset buys as deposits', () => {
    const txs = [
      {
        symbol: 'BTC',
        asset_type: 'crypto' as const,
        action: 'buy' as const,
        quantity: 0.1,
        unit_price: 3000,
        currency: 'EUR' as const,
        executed_at: '2026-07-01',
      },
    ]
    const r = averageMonthlyUserInflows(txs, 'EUR', 1, now)
    expect(r.monthlyBuys).toBeCloseTo(100, 8)
    expect(r.monthlyCash).toBe(0)
    expect(r.monthly).toBeCloseTo(100, 8)
    expect(r.months.find((m) => m.key === '2026-07')?.buys).toBe(300)
  })
})

describe('weightsFromMarketValues', () => {
  it('normalizes to 100', () => {
    const w = weightsFromMarketValues({ stock: 80, cash: 20 })
    expect(w.stock).toBe(80)
    expect(w.cash).toBe(20)
    expect(w.etf).toBe(0)
  })
})

describe('assignedPv / fundingWarning', () => {
  it('null assigned uses full MV', () => {
    expect(assignedPv(12_000, null)).toBe(12_000)
  })

  it('goalStartingValue drops cash when excluded', () => {
    expect(
      goalStartingValue({
        portfolioMv: 12_000,
        cashMv: 2000,
        assignedAmount: null,
        includeCash: false,
      })
    ).toBe(10_000)
    expect(
      goalStartingValue({
        portfolioMv: 12_000,
        cashMv: 2000,
        assignedAmount: 5000,
        includeCash: false,
      })
    ).toBe(5000)
  })

  it('single goal never warns', () => {
    expect(fundingWarning([{ assignedAmount: null }], 1000)).toBeNull()
  })

  it('two full-MV goals warn', () => {
    expect(
      fundingWarning(
        [{ assignedAmount: null }, { assignedAmount: null }],
        1000
      )
    ).toBe('full_mv_overlap')
  })

  it('assigned sums above book warn', () => {
    expect(
      fundingWarning(
        [{ assignedAmount: 800 }, { assignedAmount: 400 }],
        1000
      )
    ).toBe('assigned_exceeds_book')
  })

  it('explicit split inside the book is silent', () => {
    expect(
      fundingWarning(
        [{ assignedAmount: 600 }, { assignedAmount: 400 }],
        1000
      )
    ).toBeNull()
  })
})

describe('goalStatus / evaluateGoal', () => {
  it('incomplete without date or planned monthly', () => {
    expect(
      goalStatus({ months: null, plannedMonthly: 100, requiredMonthly: 80 })
    ).toBe('incomplete')
    expect(
      goalStatus({ months: 12, plannedMonthly: null, requiredMonthly: 80 })
    ).toBe('incomplete')
  })

  it('ahead / on_track / behind from planned vs required', () => {
    expect(
      goalStatus({ months: 12, plannedMonthly: 120, requiredMonthly: 100 })
    ).toBe('ahead')
    expect(
      goalStatus({ months: 12, plannedMonthly: 100, requiredMonthly: 100 })
    ).toBe('on_track')
    expect(
      goalStatus({ months: 12, plannedMonthly: 80, requiredMonthly: 100 })
    ).toBe('behind')
  })

  it('evaluateGoal fills required, projected, months, status', () => {
    const p = evaluateGoal({
      pv: 0,
      target: 1200,
      annualRate: 0,
      months: 12,
      plannedMonthly: 100,
    })
    expect(p.requiredMonthly).toBe(100)
    expect(p.projectedValue).toBe(1200)
    expect(p.monthsToTarget).toBe(12)
    expect(p.status).toBe('on_track')
  })
})

describe('keepContributingSurplus', () => {
  it('already there: surplus is planned FV minus target', () => {
    const s = keepContributingSurplus({
      pv: 2000,
      target: 1000,
      annualRate: 0,
      months: 10,
      plannedMonthly: 100,
    })
    expect(s.alreadyThere).toBe(true)
    expect(s.growthOnlyAtDate).toBe(2000)
    expect(s.withPlannedAtDate).toBe(3000)
    expect(s.surplusAtDate).toBe(2000)
    expect(s.monthsGrowthOnly).toBe(0)
    expect(s.monthsWithPlanned).toBe(0)
  })

  it('growth alone funds later: planned arrives earlier with surplus', () => {
    const s = keepContributingSurplus({
      pv: 1000,
      target: 1100,
      annualRate: 0.12,
      months: 24,
      plannedMonthly: 50,
    })
    expect(s.alreadyThere).toBe(false)
    expect(s.growthOnlyAtDate).toBeGreaterThan(1100)
    expect(s.withPlannedAtDate).toBeGreaterThan(s.growthOnlyAtDate)
    expect(s.surplusAtDate).toBeCloseTo(s.withPlannedAtDate - 1100, 8)
    expect(s.monthsWithPlanned).not.toBeNull()
    expect(s.monthsGrowthOnly).not.toBeNull()
    expect(s.monthsWithPlanned!).toBeLessThan(s.monthsGrowthOnly!)
  })
})

describe('seeds', () => {
  it('band midpoints', () => {
    expect(seedMonthlyFromBand('none')).toBe(0)
    expect(seedMonthlyFromBand('1_500')).toBe(250)
    expect(seedMonthlyFromBand('500_1000')).toBe(750)
    expect(seedMonthlyFromBand(null)).toBeNull()
  })

  it('horizon suggests a future date', () => {
    const now = new Date(Date.UTC(2026, 0, 15))
    expect(suggestTargetDateFromHorizon('lt_3y', now)).toBe('2028-01-15')
    expect(suggestTargetDateFromHorizon('3_10y', now)).toBe('2032-01-15')
    expect(suggestTargetDateFromHorizon(null, now)).toBeNull()
  })

  it('monthsUntil is 0 for today/past', () => {
    const now = new Date(Date.UTC(2026, 5, 1))
    expect(monthsUntil('2026-06-01', now)).toBe(0)
    expect(monthsUntil('2026-05-01', now)).toBe(0)
    expect(monthsUntil('2027-06-01', now)).toBe(12)
  })
})
