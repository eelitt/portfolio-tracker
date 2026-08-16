import { describe, it, expect } from 'vitest'
import {
  TOOL_REGISTRY,
  PORTFOLIO_ANALYST_TOOL_IDS,
  ORCHESTRATOR_TOOL_IDS,
  getTool,
  toolDescription,
  listTools,
  assertRegistryInvariants,
  assertWriteAllowed,
} from '@/lib/aiTools'

describe('aiTools registry', () => {
  it('passes invariants (key===id, write requires confirm)', () => {
    expect(() => assertRegistryInvariants()).not.toThrow()
  })

  it('lists all portfolio analyst tools', () => {
    for (const id of PORTFOLIO_ANALYST_TOOL_IDS) {
      expect(getTool(id)?.id).toBe(id)
      expect(toolDescription(id).length).toBeGreaterThan(10)
    }
  })

  it('lists all orchestrator tools', () => {
    for (const id of ORCHESTRATOR_TOOL_IDS) {
      expect(getTool(id)?.id).toBe(id)
      expect(toolDescription(id).length).toBeGreaterThan(10)
    }
  })

  it('registry size matches known tool sets', () => {
    const expected =
      PORTFOLIO_ANALYST_TOOL_IDS.length + ORCHESTRATOR_TOOL_IDS.length
    expect(Object.keys(TOOL_REGISTRY)).toHaveLength(expected)
  })

  it('confirm_transaction is the only write that requires confirmation', () => {
    const writes = listTools({ sideEffect: 'write' })
    const ids = writes.map((t) => t.id).sort()
    expect(ids).toEqual(
      ['add_watchlist_item', 'confirm_transaction', 'remove_watchlist_item'].sort()
    )
    expect(getTool('confirm_transaction')?.requiresConfirmation).toBe(true)
    expect(getTool('add_watchlist_item')?.requiresConfirmation).toBe(false)
    expect(getTool('remove_watchlist_item')?.requiresConfirmation).toBe(false)
  })

  it('toolDescription throws on unknown id', () => {
    expect(() => toolDescription('nope_tool')).toThrow(/unknown tool/)
  })
})

describe('assertWriteAllowed', () => {
  it('blocks same-turn prepare+confirm', () => {
    const r = assertWriteAllowed({
      toolId: 'confirm_transaction',
      lastUserText: 'confirm',
      preparedThisRequest: true,
      hasPendingDraft: true,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failureMode).toBe('same_turn_as_prepare')
  })

  it('blocks non-confirm user text', () => {
    const r = assertWriteAllowed({
      toolId: 'confirm_transaction',
      lastUserText: 'what is my allocation?',
      preparedThisRequest: false,
      hasPendingDraft: true,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failureMode).toBe('no_explicit_confirm')
  })

  it('blocks missing pending draft in production mode', () => {
    const r = assertWriteAllowed({
      toolId: 'confirm_transaction',
      lastUserText: 'confirm',
      preparedThisRequest: false,
      hasPendingDraft: false,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failureMode).toBe('no_pending_draft')
  })

  it('allows confirm with draft + explicit message', () => {
    const r = assertWriteAllowed({
      toolId: 'confirm_transaction',
      lastUserText: 'yes',
      preparedThisRequest: false,
      hasPendingDraft: true,
    })
    expect(r.ok).toBe(true)
  })

  it('rejects non-write tools', () => {
    const r = assertWriteAllowed({
      toolId: 'get_holdings',
      lastUserText: 'confirm',
      preparedThisRequest: false,
      hasPendingDraft: true,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failureMode).toBe('not_a_write_tool')
  })

  it('does not treat watchlist writes as confirmable through this gate', () => {
    const r = assertWriteAllowed({
      toolId: 'add_watchlist_item',
      lastUserText: 'confirm',
      preparedThisRequest: false,
      hasPendingDraft: true,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failureMode).toBe('registry_invariant')
  })
})
