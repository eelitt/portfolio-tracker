import { describe, it, expect } from 'vitest'
import {
  recoveryForFailureMode,
  toolFailure,
  withRecovery,
  confirmLevelForPrepare,
  resolveDryRun,
  dryRunNote,
  assertWriteAllowed,
} from '@/lib/aiTools'

describe('recoveryForFailureMode', () => {
  it('maps known modes', () => {
    expect(recoveryForFailureMode('no_explicit_confirm').recovery).toBe(
      'ask_user'
    )
    expect(recoveryForFailureMode('provider_unavailable').retryable).toBe(true)
    expect(recoveryForFailureMode('not_configured').recovery).toBe('abort')
    expect(recoveryForFailureMode('cooldown_store_hit').recovery).toBe(
      'fallback_simpler'
    )
  })

  it('defaults unknown to abort', () => {
    expect(recoveryForFailureMode('totally_unknown').recovery).toBe('abort')
  })
})

describe('toolFailure / withRecovery', () => {
  it('builds envelope', () => {
    const f = toolFailure('no_pending_draft', 'No draft')
    expect(f.ok).toBe(false)
    expect(f.recovery).toBe('ask_user')
    expect(f.retryable).toBe(false)
  })

  it('attaches recovery to gate payload', () => {
    const r = withRecovery({
      failureMode: 'same_turn_as_prepare',
      errors: ['wait'],
    })
    expect(r.recovery).toBe('ask_user')
  })
})

describe('confirmLevelForPrepare', () => {
  it('none when not ready', () => {
    expect(
      confirmLevelForPrepare({ status: 'incomplete', warnings: [] })
    ).toBe('none')
  })
  it('soft when warnings', () => {
    expect(
      confirmLevelForPrepare({ status: 'ready', warnings: ['oversell'] })
    ).toBe('soft')
  })
  it('hard when ready clean', () => {
    expect(confirmLevelForPrepare({ status: 'ready', warnings: [] })).toBe(
      'hard'
    )
  })
})

describe('resolveDryRun', () => {
  it('body flag', () => {
    expect(resolveDryRun({ bodyDryRun: true })).toBe(true)
  })
  it('phrase dry run', () => {
    expect(resolveDryRun({ lastUserText: 'Dry run: buy 1 BTC at $1' })).toBe(
      true
    )
  })
  it('what would you do', () => {
    expect(
      resolveDryRun({ lastUserText: 'What would you do if I sold all AAPL?' })
    ).toBe(true)
  })
  it('normal chat false', () => {
    expect(resolveDryRun({ lastUserText: 'Show my allocation' })).toBe(false)
  })
})

describe('dryRun + write gate', () => {
  it('dryRunNote shape', () => {
    const n = dryRunNote('confirm_transaction')
    expect(n.dryRun).toBe(true)
    expect(n.wouldHave).toContain('confirm')
  })

  it('write still blocked without confirm message', () => {
    const r = assertWriteAllowed({
      toolId: 'confirm_transaction',
      lastUserText: 'please save my trade now in detail',
      preparedThisRequest: false,
      hasPendingDraft: true,
    })
    expect(r.ok).toBe(false)
  })
})
