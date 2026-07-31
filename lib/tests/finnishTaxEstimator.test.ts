import { describe, it, expect } from 'vitest'
import type { Transaction } from '../types'
import {
  appTransactionsToTaxableEvents,
  applyHmoVsActual,
  buildLotsAndMatchDisposals,
  estimateFinnishCapitalGains,
  estimateProgressiveCapitalTax,
  HMO_RATE_FROM_10Y,
  HMO_RATE_UNDER_10Y,
  SMALL_DISPOSAL_PROCEEDS_THRESHOLD_EUR,
  type TaxableEvent,
} from '../tax'

function acq(
  partial: Partial<TaxableEvent> & Pick<TaxableEvent, 'id' | 'assetKey' | 'quantity' | 'unitPriceEur' | 'executedAt'>
): TaxableEvent {
  return {
    assetClass: 'crypto',
    source: { kind: 'manual' },
    costKnown: true,
    ...partial,
    type: 'acquisition',
  }
}

function disp(
  partial: Partial<TaxableEvent> & Pick<TaxableEvent, 'id' | 'assetKey' | 'quantity' | 'unitPriceEur' | 'executedAt'>
): TaxableEvent {
  return {
    assetClass: 'crypto',
    source: { kind: 'manual' },
    costKnown: true,
    ...partial,
    type: 'disposal',
  }
}

describe('estimateProgressiveCapitalTax', () => {
  it('taxes entirely at 30% when under threshold', () => {
    const { taxEur } = estimateProgressiveCapitalTax(10_000, 0)
    expect(taxEur).toBe(3000)
  })

  it('crosses into 34% when other income fills the low band', () => {
    // other 25k uses most of 30k band; gain 10k → 5k @ 30% + 5k @ 34%
    const { taxEur } = estimateProgressiveCapitalTax(10_000, 25_000)
    expect(taxEur).toBe(1500 + 1700)
  })
})

describe('FIFO vs weighted average lots', () => {
  it('FIFO consumes oldest lot first (partial sell)', () => {
    const events = [
      acq({
        id: 'b1',
        assetKey: 'BTC',
        quantity: 1,
        unitPriceEur: 10_000,
        executedAt: '2020-01-01T00:00:00.000Z',
      }),
      acq({
        id: 'b2',
        assetKey: 'BTC',
        quantity: 1,
        unitPriceEur: 30_000,
        executedAt: '2021-01-01T00:00:00.000Z',
      }),
      disp({
        id: 's1',
        assetKey: 'BTC',
        quantity: 1,
        unitPriceEur: 40_000,
        executedAt: '2022-01-01T00:00:00.000Z',
      }),
    ]
    const fifo = buildLotsAndMatchDisposals(events, 'fifo')
    expect(fifo.disposalsMatched[0].actualCostEur).toBe(10_000)

    const avg = buildLotsAndMatchDisposals(events, 'weighted_average')
    expect(avg.disposalsMatched[0].actualCostEur).toBe(20_000)
  })

  it('FIFO and weighted average differ on mixed lots', () => {
    const events = [
      acq({
        id: 'b1',
        assetKey: 'ETH',
        quantity: 2,
        unitPriceEur: 100,
        executedAt: '2023-01-01T00:00:00.000Z',
      }),
      acq({
        id: 'b2',
        assetKey: 'ETH',
        quantity: 2,
        unitPriceEur: 300,
        executedAt: '2023-06-01T00:00:00.000Z',
      }),
      disp({
        id: 's1',
        assetKey: 'ETH',
        quantity: 2,
        unitPriceEur: 400,
        executedAt: '2024-01-01T00:00:00.000Z',
      }),
    ]
    const fifoCost = buildLotsAndMatchDisposals(events, 'fifo').disposalsMatched[0].actualCostEur
    const avgCost = buildLotsAndMatchDisposals(events, 'weighted_average').disposalsMatched[0]
      .actualCostEur
    expect(fifoCost).toBe(200)
    expect(avgCost).toBe(400)
    expect(fifoCost).not.toBe(avgCost)
  })
})

describe('applyHmoVsActual', () => {
  it('uses HMO when more favorable than actual gain', () => {
    const line = applyHmoVsActual({
      disposalEventId: 's1',
      assetKey: 'BTC',
      assetClass: 'crypto',
      quantity: 1,
      proceedsEur: 100_000,
      feeEur: 0,
      executedAt: '2024-01-01T00:00:00.000Z',
      actualCostEur: 5_000,
      costBasisReliable: true,
      hmoRate: HMO_RATE_UNDER_10Y,
      consumedLots: [
        {
          quantity: 1,
          unitCostEur: 5_000,
          acquiredAt: '2020-01-01T00:00:00.000Z',
          costEur: 5_000,
          costKnown: true,
        },
      ],
      method: 'fifo',
      quantityCapped: false,
    })
    // actual gain 95k; HMO 20% → taxable 80k
    expect(line.basisUsed).toBe('hmo')
    expect(line.taxableGainOrLossEur).toBe(80_000)
  })

  it('does not apply HMO on an actual loss', () => {
    const line = applyHmoVsActual({
      disposalEventId: 's1',
      assetKey: 'BTC',
      assetClass: 'crypto',
      quantity: 1,
      proceedsEur: 8_000,
      feeEur: 0,
      executedAt: '2024-01-01T00:00:00.000Z',
      actualCostEur: 10_000,
      costBasisReliable: true,
      hmoRate: HMO_RATE_UNDER_10Y,
      consumedLots: [
        {
          quantity: 1,
          unitCostEur: 10_000,
          acquiredAt: '2020-01-01T00:00:00.000Z',
          costEur: 10_000,
          costKnown: true,
        },
      ],
      method: 'fifo',
      quantityCapped: false,
    })
    expect(line.basisUsed).toBe('actual')
    expect(line.taxableGainOrLossEur).toBe(-2_000)
  })

  it('uses 40% HMO when all lots held ≥ 10 years', () => {
    const matched = buildLotsAndMatchDisposals(
      [
        acq({
          id: 'b1',
          assetKey: 'NOK',
          assetClass: 'security',
          quantity: 10,
          unitPriceEur: 1,
          executedAt: '2010-01-01T00:00:00.000Z',
        }),
        disp({
          id: 's1',
          assetKey: 'NOK',
          assetClass: 'security',
          quantity: 10,
          unitPriceEur: 100,
          executedAt: '2025-01-01T00:00:00.000Z',
        }),
      ],
      'fifo'
    ).disposalsMatched[0]
    expect(matched.hmoRate).toBe(HMO_RATE_FROM_10Y)
    const line = applyHmoVsActual(matched)
    // proceeds 1000, actual cost 10 → gain 990; HMO 40% → 600 taxable
    expect(line.basisUsed).toBe('hmo')
    expect(line.taxableGainOrLossEur).toBe(600)
  })
})

describe('estimateFinnishCapitalGains', () => {
  it('simple buy then full sell: HMO can win on large gain', () => {
    const result = estimateFinnishCapitalGains({
      taxYear: 2024,
      mode: 'ytd',
      events: [
        acq({
          id: 'b1',
          assetKey: 'BTC',
          quantity: 1,
          unitPriceEur: 1_000,
          executedAt: '2023-01-01T00:00:00.000Z',
        }),
        disp({
          id: 's1',
          assetKey: 'BTC',
          quantity: 1,
          unitPriceEur: 20_000,
          executedAt: '2024-06-01T00:00:00.000Z',
        }),
      ],
    })
    // actual gain 19k; HMO 20% → 16k taxable
    expect(result.methods.fifo.taxableBaseEur).toBe(16_000)
    expect(result.methods.fifo.estimatedTaxEur).toBe(4_800)
    expect(result.methods.fifo.usedHmoOnAnyDisposal).toBe(true)
  })

  it('applies small-disposal rule when proceeds ≤ €1000', () => {
    const result = estimateFinnishCapitalGains({
      taxYear: 2024,
      mode: 'ytd',
      events: [
        acq({
          id: 'b1',
          assetKey: 'AAPL',
          assetClass: 'security',
          quantity: 1,
          unitPriceEur: 10,
          executedAt: '2023-01-01T00:00:00.000Z',
        }),
        disp({
          id: 's1',
          assetKey: 'AAPL',
          assetClass: 'security',
          quantity: 1,
          unitPriceEur: 500,
          executedAt: '2024-03-01T00:00:00.000Z',
        }),
      ],
    })
    expect(result.smallDisposal.totalProceedsInScopeEur).toBeLessThanOrEqual(
      SMALL_DISPOSAL_PROCEEDS_THRESHOLD_EUR
    )
    expect(result.smallDisposal.mayBeTaxFree).toBe(true)
    expect(result.methods.fifo.taxableBaseEur).toBe(0)
    expect(result.methods.fifo.estimatedTaxEur).toBe(0)
  })

  it('nets YTD gains and losses within the year', () => {
    const result = estimateFinnishCapitalGains({
      taxYear: 2024,
      mode: 'ytd',
      events: [
        acq({
          id: 'b1',
          assetKey: 'AAA',
          quantity: 1,
          unitPriceEur: 1_000,
          executedAt: '2023-01-01T00:00:00.000Z',
        }),
        disp({
          id: 's1',
          assetKey: 'AAA',
          quantity: 1,
          unitPriceEur: 2_000,
          executedAt: '2024-01-01T00:00:00.000Z',
        }),
        acq({
          id: 'b2',
          assetKey: 'BBB',
          quantity: 1,
          unitPriceEur: 1_000,
          executedAt: '2023-01-01T00:00:00.000Z',
        }),
        disp({
          id: 's2',
          assetKey: 'BBB',
          quantity: 1,
          unitPriceEur: 400,
          executedAt: '2024-02-01T00:00:00.000Z',
        }),
      ],
    })
    // AAA: gain 1000 actual (HMO 1600, actual wins) → +1000
    // BBB: loss -600
    // proceeds 2400 > €1000 small-disposal threshold
    // net +400 → tax 120
    expect(result.smallDisposal.mayBeTaxFree).toBe(false)
    expect(result.methods.fifo.netGainOrLossEur).toBe(400)
    expect(result.methods.fifo.estimatedTaxEur).toBe(120)
  })

  it('uses HMO primary when costKnown is false', () => {
    const result = estimateFinnishCapitalGains({
      taxYear: 2024,
      mode: 'ytd',
      events: [
        acq({
          id: 'b1',
          assetKey: 'BTC',
          quantity: 1,
          unitPriceEur: 50_000,
          executedAt: '2023-01-01T00:00:00.000Z',
          costKnown: false,
        }),
        disp({
          id: 's1',
          assetKey: 'BTC',
          quantity: 1,
          unitPriceEur: 60_000,
          executedAt: '2024-01-01T00:00:00.000Z',
        }),
      ],
    })
    const line = result.methods.fifo.disposals[0]
    expect(line.costBasisReliable).toBe(false)
    expect(line.basisUsed).toBe('hmo')
    expect(line.taxableGainOrLossEur).toBe(48_000) // 80% of 60k
  })

  it('hypothetical sell uses history for cost and only taxes the synthetic disposal', () => {
    const result = estimateFinnishCapitalGains({
      taxYear: 2026,
      mode: 'hypothetical_sell',
      events: [
        acq({
          id: 'b1',
          assetKey: 'ETH',
          quantity: 2,
          unitPriceEur: 1_000,
          executedAt: '2025-01-01T00:00:00.000Z',
        }),
        disp({
          id: 's-old',
          assetKey: 'ETH',
          quantity: 1,
          unitPriceEur: 2_000,
          executedAt: '2025-06-01T00:00:00.000Z',
        }),
      ],
      hypothetical: {
        assetKey: 'ETH',
        quantity: 1,
        unitPriceEur: 3_000,
        executedAt: '2026-03-01T00:00:00.000Z',
      },
    })
    expect(result.methods.fifo.disposals).toHaveLength(1)
    expect(result.methods.fifo.disposals[0].isHypothetical).toBe(true)
    // remaining lot cost 1000 after FIFO sold first lot; proceeds 3000; actual gain 2000
    // HMO 20% → 2400; actual better
    expect(result.methods.fifo.disposals[0].taxableGainOrLossEur).toBe(2_000)
    expect(result.methods.fifo.estimatedTaxEur).toBe(600)
  })

  it('full mode includes year-end notes and dual methods', () => {
    const result = estimateFinnishCapitalGains({
      taxYear: 2024,
      mode: 'full',
      otherCapitalIncomeEur: 0,
      events: [
        acq({
          id: 'b1',
          assetKey: 'BTC',
          quantity: 1,
          unitPriceEur: 10_000,
          executedAt: '2020-01-01T00:00:00.000Z',
        }),
        acq({
          id: 'b2',
          assetKey: 'BTC',
          quantity: 1,
          unitPriceEur: 30_000,
          executedAt: '2021-01-01T00:00:00.000Z',
        }),
        disp({
          id: 's1',
          assetKey: 'BTC',
          quantity: 1,
          unitPriceEur: 50_000,
          executedAt: '2024-06-01T00:00:00.000Z',
        }),
      ],
      hypothetical: {
        assetKey: 'BTC',
        quantity: 0.5,
        unitPriceEur: 60_000,
        executedAt: '2024-12-01T00:00:00.000Z',
      },
    })
    expect(result.methods.fifo.disposals.length).toBeGreaterThanOrEqual(1)
    expect(result.methods.weightedAverage.disposals.length).toBeGreaterThanOrEqual(1)
    expect(result.disclaimers.length).toBeGreaterThan(0)
    expect(result.currency).toBe('EUR')
    // FIFO cost 10k vs avg 20k on first full unit → methods can diverge
    expect(result.comparison.taxDeltaEur).toBeGreaterThanOrEqual(0)
  })

  it('progressive tax with other capital income', () => {
    const result = estimateFinnishCapitalGains({
      taxYear: 2024,
      mode: 'ytd',
      otherCapitalIncomeEur: 28_000,
      events: [
        acq({
          id: 'b1',
          assetKey: 'X',
          quantity: 1,
          unitPriceEur: 0,
          executedAt: '2023-01-01T00:00:00.000Z',
          costKnown: false,
        }),
        // Force simple: buy at 0 cost known false → HMO on 10k proceeds = 8k taxable
        disp({
          id: 's1',
          assetKey: 'X',
          quantity: 1,
          unitPriceEur: 10_000,
          executedAt: '2024-01-01T00:00:00.000Z',
        }),
      ],
    })
    // 2k left in 30% band, 6k at 34% → 600 + 2040 = 2640
    expect(result.methods.fifo.taxableBaseEur).toBe(8_000)
    expect(result.methods.fifo.estimatedTaxEur).toBe(2_640)
  })
})

describe('appTransactionsToTaxableEvents', () => {
  it('maps buy/sell and skips cash and inflow/outflow', () => {
    const txs: Transaction[] = [
      {
        id: '1',
        symbol: 'btc',
        asset_type: 'crypto',
        action: 'buy',
        quantity: 1,
        unit_price: 100,
        executed_at: '2024-01-01T00:00:00.000Z',
        currency: 'EUR',
      },
      {
        id: '2',
        symbol: 'BTC',
        asset_type: 'crypto',
        action: 'sell',
        quantity: 0.5,
        unit_price: 200,
        executed_at: '2024-06-01T00:00:00.000Z',
        currency: 'EUR',
      },
      {
        id: '3',
        symbol: 'EUR',
        asset_type: 'cash',
        action: 'inflow',
        quantity: 1000,
        unit_price: 1,
        executed_at: '2024-01-02T00:00:00.000Z',
        currency: 'EUR',
      },
      {
        id: '4',
        symbol: 'USD',
        asset_type: 'cash',
        action: 'outflow',
        quantity: 50,
        unit_price: 1,
        executed_at: '2024-01-03T00:00:00.000Z',
        currency: 'USD',
      },
    ]
    const events = appTransactionsToTaxableEvents(txs, { usdToEurRate: 0.9 })
    expect(events).toHaveLength(2)
    expect(events[0].type).toBe('acquisition')
    expect(events[0].assetKey).toBe('BTC')
    expect(events[0].source).toEqual({ kind: 'app_transaction', transactionId: '1' })
    expect(events[1].type).toBe('disposal')
    expect(events[0].unitPriceEur).toBe(100)
  })

  it('converts USD unit prices to EUR', () => {
    const txs: Transaction[] = [
      {
        id: '1',
        symbol: 'AAPL',
        asset_type: 'stock',
        action: 'buy',
        quantity: 1,
        unit_price: 100,
        executed_at: '2024-01-01T00:00:00.000Z',
        currency: 'USD',
      },
    ]
    const events = appTransactionsToTaxableEvents(txs, { usdToEurRate: 0.9 })
    expect(events[0].unitPriceEur).toBe(90)
    expect(events[0].assetClass).toBe('security')
  })
})
