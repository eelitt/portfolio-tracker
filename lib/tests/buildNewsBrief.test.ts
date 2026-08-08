/**
 * Unit tests for deterministic news brief (orchestrator-facing, no cache jargon).
 */

import { describe, it, expect } from 'vitest'
import { buildNewsBrief } from '../../app/actions/ai/holding-news/newsUtils'

describe('buildNewsBrief', () => {
  it('returns empty-holdings message', () => {
    expect(buildNewsBrief([])).toMatch(/No holdings/i)
  })

  it('returns no-material message when all bullets empty', () => {
    const s = buildNewsBrief([
      { symbol: 'AAPL', bullets: [] },
      { symbol: 'BTC', bullets: [] },
    ])
    expect(s).toMatch(/No material headlines/i)
    expect(s).toMatch(/AAPL/)
    expect(s.toLowerCase()).not.toMatch(/cache/)
  })

  it('lists bullets and outlook; ranks negative first', () => {
    const s = buildNewsBrief([
      {
        symbol: 'ETH',
        bullets: ['ETH upgraded network'],
        impact: { tone: 'positive', outlook: 'Constructive near term' },
      },
      {
        symbol: 'BTC',
        bullets: ['BTC sold off on ETF outflows'],
        impact: { tone: 'negative', outlook: 'Pressure may continue' },
      },
    ])
    expect(s.indexOf('BTC')).toBeLessThan(s.indexOf('ETH'))
    expect(s).toMatch(/ETF outflows/)
    expect(s).toMatch(/Outlook \(negative\)/)
    expect(s.toLowerCase()).not.toMatch(/cache|refresh|stored/)
  })
})
