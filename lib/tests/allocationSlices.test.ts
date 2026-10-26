import { describe, expect, it } from 'vitest'
import { buildHoldingSlices } from '@/app/(app)/dashboard/holdings/allocationSlices'

describe('buildHoldingSlices Other parts', () => {
  it('keeps a small holding inside Other, largest first', () => {
    const slices = buildHoldingSlices([
      { symbol: 'BIG', marketValue: 96, asset_type: 'stock' },
      { symbol: 'TINY', marketValue: 1.6, asset_type: 'crypto' },
      { symbol: 'SMALL', marketValue: 2.4, asset_type: 'etf' },
    ])

    expect(slices.map((s) => s.name)).toEqual(['BIG', 'Other'])
    const other = slices[1]
    expect(other.value).toBeCloseTo(4)
    expect(other.parts?.map((p) => p.name)).toEqual(['SMALL', 'TINY'])
    expect(other.parts?.[0].percent).toBeCloseTo(0.024)
    expect(other.parts?.[1].percent).toBeCloseTo(0.016)
  })

  it('puts the 8th large holding into Other', () => {
    const slices = buildHoldingSlices(
      Array.from({ length: 8 }, (_, i) => ({
        symbol: `S${i}`,
        marketValue: 10,
        asset_type: 'stock' as const,
      }))
    )

    expect(slices).toHaveLength(8)
    expect(slices[7].name).toBe('Other')
    expect(slices[7].parts?.map((p) => p.name)).toEqual(['S7'])
    expect(slices.slice(0, 7).some((s) => s.name === 'S7')).toBe(false)
  })
})
