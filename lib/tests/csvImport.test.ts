import { describe, expect, it } from 'vitest'
import { normalizeCsvImport, planImport, type ImportStep } from '@/lib/csvImport'
import { ledgerPerpRows, reducePerps } from '@/lib/perps'
import type { SaveRow } from '@/lib/perpSave'
import type { TransactionFormData } from '@/lib/schemas'

const NOW = '2026-01-05T00:00:00.000Z'

function cash(amount: number): SaveRow {
  return {
    id: 'cash',
    symbol: 'Available Cash',
    asset_type: 'cash',
    action: 'inflow',
    quantity: amount,
    unit_price: 1,
    currency: 'USD',
    executed_at: '2026-01-01T00:00:00Z',
  }
}

function future(
  partial: Partial<TransactionFormData> & Pick<TransactionFormData, 'action' | 'executed_at'>
): TransactionFormData {
  return {
    symbol: 'BTC',
    asset_type: 'future',
    position_side: 'long',
    quantity: 0.2,
    unit_price: 100000,
    amount: 1000,
    currency: 'USD',
    ...partial,
  }
}

function plan(
  existing: SaveRow[],
  incoming: TransactionFormData[],
  allowed: (symbol: string) => boolean = (symbol) => symbol.toUpperCase() === 'BTC'
) {
  return planImport({
    existing,
    incoming: incoming.map((row, index) => ({ row, index })),
    usdToEurRate: 0.92,
    marks: { BTC: { mark: 101000 } },
    nowIso: NOW,
    defaultCurrency: 'USD',
    futureSymbolAllowed: allowed,
  })
}

function savedRows(steps: ImportStep[]) {
  return steps
    .filter((step): step is Extract<ImportStep, { ok: true }> => step.ok)
    .flatMap((step) => step.rows)
}

function skipped(steps: ImportStep[]) {
  return steps.filter((step): step is Extract<ImportStep, { ok: false }> => !step.ok)
}

describe('normalizeCsvImport', () => {
  it('maps BTCUSDT, drops notional and realized profit, and splits the fee', () => {
    const parsed = normalizeCsvImport({
      transactions: [
        {
          symbol: 'BTCUSDT',
          asset_type: 'future',
          action: 'buy',
          position_side: 'long',
          quantity: 0.2,
          unit_price: 100000,
          amount: 20000,
          realized_pnl: 150,
          fee: 1.25,
          executed_at: '2026-01-02T15:04:00Z',
        },
      ],
    })
    expect(parsed.transactions).toHaveLength(2)
    const [fill, fee] = parsed.transactions
    expect(fill?.symbol).toBe('BTC')
    expect(fill?.amount).toBeNull()
    expect(fill?.quantity).toBe(0.2)
    expect(fill?.unit_price).toBe(100000)
    expect(fill?.executed_at).toBe('2026-01-02T15:04:00Z')
    expect(fee?.action).toBe('fee')
    expect(fee?.amount).toBe(-1.25)
    expect(fee?.position_side).toBe('long')
    expect(fee?.quantity).toBeNull()
    expect(JSON.stringify(parsed.transactions)).not.toContain('150')
    expect(JSON.stringify(parsed.transactions)).not.toContain('20000')
  })

  it('keeps a stated margin and warns on liquidation, inverse, option, and wallet transfer', () => {
    const parsed = normalizeCsvImport({
      transactions: [
        {
          symbol: 'BTCUSDT',
          asset_type: 'future',
          action: 'buy',
          position_side: 'long',
          quantity: 0.2,
          unit_price: 100000,
          amount: 1000,
          executed_at: '2026-01-02T00:00:00Z',
        },
        {
          symbol: 'BTCUSDT',
          asset_type: 'future',
          action: 'sell',
          position_side: 'long',
          quantity: 0.2,
          unit_price: 101000,
          executed_at: '2026-01-03T00:00:00Z',
          skip: 'liquidation',
        },
        {
          symbol: 'BTCUSD',
          asset_type: 'future',
          action: 'buy',
          position_side: 'long',
          quantity: 1,
          unit_price: 1,
          executed_at: '2026-01-03T00:00:00Z',
          skip: 'inverse',
        },
        {
          symbol: 'BTC',
          asset_type: 'future',
          action: 'buy',
          position_side: 'long',
          quantity: 1,
          unit_price: 1,
          executed_at: '2026-01-03T00:00:00Z',
          skip: 'option',
        },
        {
          symbol: 'USDT',
          asset_type: 'cash',
          action: 'outflow',
          quantity: 1000,
          unit_price: 1,
          executed_at: '2026-01-02T00:00:00Z',
          skip: 'wallet_transfer',
        },
      ],
    })
    expect(parsed.transactions).toHaveLength(1)
    expect(parsed.transactions[0]?.amount).toBe(1000)
    const warnings = parsed.warnings ?? []
    expect(warnings.map((warning) => warning.toLowerCase()).join(' ')).toContain('liquidation')
    expect(warnings.join(' ')).toContain('inverse')
    expect(warnings.join(' ')).toContain('option')
    expect(warnings.join(' ')).toContain('wallet')
  })
})

describe('planImport', () => {
  it('saves an open, its fee, and funding, and skips an oversize reduce', () => {
    const open = future({ action: 'buy', executed_at: '2026-01-02T01:00:00Z' })
    const fee = future({
      action: 'fee',
      executed_at: '2026-01-02T01:00:00Z',
      quantity: null,
      unit_price: null,
      amount: -2,
    })
    const funding = future({
      action: 'funding',
      executed_at: '2026-01-03T00:00:00Z',
      quantity: null,
      unit_price: null,
      amount: 5,
    })
    const tooBig = future({
      action: 'sell',
      executed_at: '2026-01-04T00:00:00Z',
      quantity: 1,
      amount: null,
    })
    const result = plan([cash(10000)], [fee, open, funding, tooBig])
    const rows = savedRows(result.steps)
    expect(rows.map((row) => row.action)).toEqual(['buy', 'fee', 'funding'])
    expect(rows.some((row) => row.symbol === 'Available Cash')).toBe(false)
    const skippedRows = skipped(result.steps)
    expect(skippedRows).toHaveLength(1)
    expect(skippedRows[0]?.reason).toContain('reduce is larger than that side')
  })

  it('does not write Available Cash for a future sell', () => {
    const open = future({ action: 'buy', executed_at: '2026-01-02T00:00:00Z' })
    const close = future({
      action: 'sell',
      executed_at: '2026-01-04T00:00:00Z',
      quantity: 0.1,
      unit_price: 101000,
      amount: null,
    })
    const rows = savedRows(plan([cash(10000)], [open, close]).steps)
    expect(rows.map((row) => row.action)).toEqual(['buy', 'sell'])
    expect(rows.some((row) => row.asset_type === 'cash')).toBe(false)
  })

  it('still writes Available Cash for a spot sell', () => {
    const sell: TransactionFormData = {
      symbol: 'AAPL',
      asset_type: 'stock',
      action: 'sell',
      quantity: 2,
      unit_price: 10,
      executed_at: '2026-01-02T00:00:00Z',
      currency: 'USD',
    }
    const rows = savedRows(plan([], [sell]).steps)
    const proceeds = rows.find((row) => row.symbol === 'Available Cash')
    expect(proceeds?.quantity).toBe(20)
    expect(proceeds?.notes).toContain('Proceeds from SELL')
  })

  it('leaves a blank-margin open unsaved until the preview has a margin', () => {
    const open = future({
      action: 'buy',
      executed_at: '2026-01-02T00:00:00Z',
      amount: null,
    })
    const blocked = plan([cash(10000)], [open])
    expect(savedRows(blocked.steps)).toHaveLength(0)
    expect(skipped(blocked.steps)[0]?.reason).toContain('margin is required to open')

    const ready = plan([cash(10000)], [{ ...open, amount: 1000 }])
    expect(ready.steps.filter((step) => !step.ok)).toHaveLength(0)
    expect(savedRows(ready.steps)).toHaveLength(1)
  })

  it('fails a fee that needed an open that did not save', () => {
    const open = future({
      action: 'buy',
      executed_at: '2026-01-02T00:00:00Z',
      amount: null,
    })
    const fee = future({
      action: 'fee',
      executed_at: '2026-01-02T01:00:00Z',
      quantity: null,
      unit_price: null,
      amount: -2,
    })
    const result = plan([cash(10000)], [open, fee])
    expect(savedRows(result.steps)).toHaveLength(0)
    expect(skipped(result.steps).map((step) => step.reason).join(' ')).toContain(
      'that side is not open'
    )
  })

  it('imports the same open again and doubles the position', () => {
    const open = future({ action: 'buy', executed_at: '2026-01-02T00:00:00Z' })
    const first = plan([cash(10000)], [open])
    const second = plan([cash(10000), ...savedRows(first.steps)], [open])
    expect(second.steps.filter((step) => !step.ok)).toHaveLength(0)
    const book = [cash(10000), ...savedRows(first.steps), ...savedRows(second.steps)]
    const reduced = reducePerps({ rows: ledgerPerpRows(book) })
    expect(reduced.positions).toHaveLength(1)
    expect(reduced.positions[0]?.quantity).toBe(0.4)
  })
})
