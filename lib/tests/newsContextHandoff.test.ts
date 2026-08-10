import { describe, it, expect } from 'vitest'
import { parseNewsContextHandoff } from '@/lib/agents/newsContext'

describe('parseNewsContextHandoff', () => {
  it('accepts slim valid handoff', () => {
    const r = parseNewsContextHandoff({
      ok: true,
      holdings: [
        {
          symbol: 'AAPL',
          bullets: ['Earnings beat'],
          impact: { tone: 'positive', outlook: 'Near-term supportive' },
        },
      ],
      brief: 'Notable items…',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.news.holdings[0].symbol).toBe('AAPL')
      expect(r.news.brief).toContain('Notable')
    }
  })

  it('rejects invented ok:false or empty holdings', () => {
    expect(parseNewsContextHandoff({ ok: false, holdings: [] }).ok).toBe(false)
    expect(
      parseNewsContextHandoff({ ok: true, holdings: [] }).ok
    ).toBe(false)
  })

  it('rejects free-form junk', () => {
    expect(
      parseNewsContextHandoff({
        ok: true,
        holdings: [{ symbol: 'X', bullets: ['y'], evil: true }],
      }).ok
    ).toBe(false)
    expect(parseNewsContextHandoff('NVDA moon').ok).toBe(false)
  })
})
