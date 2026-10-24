import { describe, it, expect } from 'vitest'
import { getHoldingLogoCandidates } from '@/app/(app)/dashboard/holdings/holdingLogo'

describe('holding logos', () => {
  it('uses etf/op.svg first for OP Amerikka Indeksi A', () => {
    const paths = getHoldingLogoCandidates('OP AMERIKKA INDEKSI A', 'etf')
    expect(paths[0]).toBe('/holdings/logos/etf/op.svg')
    expect(paths.some((p) => p.includes(' '))).toBe(false)
  })

  it('does not apply the OP mark to other funds', () => {
    const paths = getHoldingLogoCandidates('S-PANKKI USA ESG OSAKE A', 'etf')
    expect(paths.some((p) => p.includes('/op.'))).toBe(false)
    expect(getHoldingLogoCandidates('SPY', 'etf')).toContain(
      '/holdings/logos/etf/spy.svg'
    )
  })
})
