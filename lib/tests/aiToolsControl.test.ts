import { describe, it, expect } from 'vitest'
import {
  recoveryForFailureMode,
  toolFailure,
  withRecovery,
  confirmLevelForPrepare,
  resolveDryRun,
  dryRunNote,
  assertWriteAllowed,
  isExplicitConfirmMessage,
  isElevatedConfirmMessage,
  PORTFOLIO_ANALYST_TOOL_IDS,
  ORCHESTRATOR_TOOL_IDS,
  getTool,
  listTools,
  TOOL_REGISTRY,
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
    expect(recoveryForFailureMode('elevated_confirm_required').recovery).toBe(
      'ask_user'
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
  it('elevated_hard when warnings', () => {
    expect(
      confirmLevelForPrepare({ status: 'ready', warnings: ['oversell'] })
    ).toBe('elevated_hard')
  })
  it('hard when ready clean', () => {
    expect(confirmLevelForPrepare({ status: 'ready', warnings: [] })).toBe(
      'hard'
    )
  })
})

describe('confirm messages', () => {
  it('explicit confirm allows bare yes', () => {
    expect(isExplicitConfirmMessage('yes')).toBe(true)
    expect(isExplicitConfirmMessage('confirm')).toBe(true)
  })
  it('elevated requires stronger phrase', () => {
    expect(isElevatedConfirmMessage('yes')).toBe(false)
    expect(isElevatedConfirmMessage('confirm')).toBe(false)
    expect(isElevatedConfirmMessage('confirm sell')).toBe(true)
    expect(isElevatedConfirmMessage('confirm trade')).toBe(true)
  })
})

describe('assertWriteAllowed elevated', () => {
  it('blocks bare yes when requiresElevatedConfirm', () => {
    const r = assertWriteAllowed({
      toolId: 'confirm_transaction',
      lastUserText: 'yes',
      preparedThisRequest: false,
      hasPendingDraft: true,
      requiresElevatedConfirm: true,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failureMode).toBe('elevated_confirm_required')
  })

  it('allows confirm sell when elevated required', () => {
    const r = assertWriteAllowed({
      toolId: 'confirm_transaction',
      lastUserText: 'confirm sell',
      preparedThisRequest: false,
      hasPendingDraft: true,
      requiresElevatedConfirm: true,
    })
    expect(r.ok).toBe(true)
  })

  it('allows bare yes when not elevated', () => {
    const r = assertWriteAllowed({
      toolId: 'confirm_transaction',
      lastUserText: 'yes',
      preparedThisRequest: false,
      hasPendingDraft: true,
      requiresElevatedConfirm: false,
    })
    expect(r.ok).toBe(true)
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

describe('dryRunNote', () => {
  it('shape', () => {
    const n = dryRunNote('confirm_transaction')
    expect(n.dryRun).toBe(true)
    expect(n.wouldHave).toContain('confirm')
  })
})

/**
 * Factory key alignment without importing server-only tool modules:
 * documented ID lists must match registry owners exactly.
 * (createPortfolioAnalystTools / createOrchestratorTools keys must stay in sync.)
 */
describe('registry factory ID lists', () => {
  it('portfolio analyst list matches owner filter', () => {
    const fromOwner = listTools({ owner: 'portfolio_analyst' })
      .map((t) => t.id)
      .sort()
    expect(fromOwner).toEqual([...PORTFOLIO_ANALYST_TOOL_IDS].sort())
    for (const id of PORTFOLIO_ANALYST_TOOL_IDS) {
      expect(getTool(id)?.owner).toBe('portfolio_analyst')
    }
  })

  it('orchestrator list matches owner filter', () => {
    const fromOwner = listTools({ owner: 'orchestrator' })
      .map((t) => t.id)
      .sort()
    expect(fromOwner).toEqual([...ORCHESTRATOR_TOOL_IDS].sort())
  })

  it('every registry entry is on a factory list', () => {
    const listed = new Set([
      ...PORTFOLIO_ANALYST_TOOL_IDS,
      ...ORCHESTRATOR_TOOL_IDS,
    ])
    for (const id of Object.keys(TOOL_REGISTRY)) {
      expect(listed.has(id)).toBe(true)
    }
  })
})
