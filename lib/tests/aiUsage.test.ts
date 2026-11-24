import { describe, expect, it } from 'vitest'
import {
  AI_ENTRY_STALE_MS,
  AI_USAGE_WINDOW_MS,
  aiEntryIsBusy,
  allowanceLeft,
  allowanceRefusalMessage,
  decideAiAllowance,
  effectivePeriodStart,
  parseAllowanceUsd,
  sumUsage,
  usageTotalsFromRpc,
  type UsageRow,
} from '../aiUsage/decide'

const now = new Date('2026-11-24T12:00:00.000Z')

function row(partial: Partial<UsageRow> & Pick<UsageRow, 'userId'>): UsageRow {
  return {
    createdAt: now.toISOString(),
    promptTokens: 0,
    completionTokens: 0,
    estimatedCostUsd: 0,
    eval: false,
    ...partial,
  }
}

describe('AI entry slot', () => {
  it('treats a missing timestamp as free and a 4 minute slot as busy', () => {
    expect(aiEntryIsBusy(null, now)).toBe(false)
    expect(aiEntryIsBusy('not-a-date', now)).toBe(false)
    const taken = new Date(now.getTime() - AI_ENTRY_STALE_MS).toISOString()
    expect(aiEntryIsBusy(taken, now)).toBe(true)
    const stale = new Date(now.getTime() - AI_ENTRY_STALE_MS - 1).toISOString()
    expect(aiEntryIsBusy(stale, now)).toBe(false)
  })
})

describe('AI usage totals', () => {
  it('reads the sql sums and rejects a missing field', () => {
    const totals = usageTotalsFromRpc({
      product_window_prompt: 1,
      product_window_completion: 2,
      product_window_usd: '0.25',
      product_all_prompt: 3,
      product_all_completion: 4,
      product_all_usd: 1.5,
      eval_window_prompt: 0,
      eval_window_completion: 0,
      eval_window_usd: 0,
      eval_all_prompt: 9,
      eval_all_completion: 1,
      eval_all_usd: 0.5,
    })
    expect(totals?.window.estimatedUsd).toBe(0.25)
    expect(totals?.allTime.estimatedUsd).toBe(1.5)
    expect(totals?.evalAllTime.promptTokens).toBe(9)
    expect(usageTotalsFromRpc({ product_window_prompt: 1 })).toBeNull()
  })
})

describe('AI allowance decision', () => {
  it('refuses a non-admin at the allowance and allows a fraction under it', () => {
    expect(
      decideAiAllowance({
        readFailed: false,
        isAdmin: false,
        allowanceUsd: 1,
        spentUsd: 1,
      }).allowed
    ).toBe(false)
    expect(
      decideAiAllowance({
        readFailed: false,
        isAdmin: false,
        allowanceUsd: 1,
        spentUsd: 0.999999,
      }).allowed
    ).toBe(true)
    expect(
      decideAiAllowance({
        readFailed: false,
        isAdmin: false,
        allowanceUsd: 1,
        spentUsd: 1.000001,
      }).allowed
    ).toBe(false)
  })

  it('does not cap an admin, and a failed read refuses everyone', () => {
    expect(
      decideAiAllowance({
        readFailed: false,
        isAdmin: true,
        allowanceUsd: 1,
        spentUsd: 50,
      })
    ).toEqual({ allowed: true, reason: 'admin' })
    expect(
      decideAiAllowance({
        readFailed: true,
        isAdmin: true,
        allowanceUsd: 1,
        spentUsd: 0,
      }).allowed
    ).toBe(false)
  })
})

describe('AI usage sum', () => {
  const rows: UsageRow[] = [
    row({ userId: 'a', estimatedCostUsd: 0.4, promptTokens: 10, completionTokens: 2 }),
    row({
      userId: 'a',
      estimatedCostUsd: 9,
      promptTokens: 100,
      completionTokens: 50,
      eval: true,
    }),
    row({ userId: 'b', estimatedCostUsd: 0.8, promptTokens: 5, completionTokens: 5 }),
    row({
      userId: 'a',
      createdAt: '2026-10-01T00:00:00.000Z',
      estimatedCostUsd: 0.2,
      promptTokens: 3,
      completionTokens: 1,
    }),
  ]

  it('keeps user A out of user B and leaves eval out of the product sum', () => {
    const start = new Date('2026-11-01T00:00:00.000Z')
    expect(sumUsage(rows, 'b', start, 'product').estimatedUsd).toBe(0.8)
    expect(sumUsage(rows, 'a', start, 'product')).toEqual({
      promptTokens: 10,
      completionTokens: 2,
      estimatedUsd: 0.4,
    })
    expect(sumUsage(rows, 'a', start, 'eval').estimatedUsd).toBe(9)
    expect(sumUsage(rows, 'a', null, 'product').estimatedUsd).toBeCloseTo(0.6)
  })
})

describe('AI usage window', () => {
  it('rolls a start that is 30 days old and keeps a younger one', () => {
    const young = new Date(now.getTime() - AI_USAGE_WINDOW_MS + 1).toISOString()
    expect(effectivePeriodStart(young, now).rolled).toBe(false)
    const old = new Date(now.getTime() - AI_USAGE_WINDOW_MS).toISOString()
    const rolled = effectivePeriodStart(old, now)
    expect(rolled.rolled).toBe(true)
    expect(rolled.start.toISOString()).toBe(now.toISOString())
    expect(effectivePeriodStart(null, now).rolled).toBe(true)
  })

  it('floors what is left at zero and reports the amount over', () => {
    expect(allowanceLeft(1, 0.25)).toEqual({ leftUsd: 0.75, overUsd: 0 })
    expect(allowanceLeft(1, 1.1)).toEqual({ leftUsd: 0, overUsd: 0.1 })
  })

  it('rejects a negative allowance', () => {
    expect(parseAllowanceUsd(-0.01)).toBeNull()
    expect(parseAllowanceUsd(0)).toBe(0)
    expect(parseAllowanceUsd(1.5)).toBe(1.5)
  })

  it('names the reset time in the refusal', () => {
    const ends = new Date('2026-12-24T12:00:00.000Z')
    expect(allowanceRefusalMessage(ends)).toContain(ends.toISOString())
    expect(allowanceRefusalMessage(ends)).not.toMatch(/wait \d+ seconds/i)
  })
})
