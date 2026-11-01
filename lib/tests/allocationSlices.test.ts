import { describe, expect, it } from 'vitest'
import {
  buildHoldingSlices,
  buildTypeSlices,
} from '@/app/(app)/dashboard/holdings/allocationSlices'

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

  it('keeps an open side off the spot symbol and off the other side', () => {
    const slices = buildHoldingSlices([
      { symbol: 'BTC', marketValue: 100, asset_type: 'crypto' },
      { symbol: 'BTC', marketValue: 40, asset_type: 'future', positionSide: 'long' },
      { symbol: 'BTC', marketValue: 25, asset_type: 'future', positionSide: 'short' },
    ])

    expect(slices.map((s) => s.id)).toEqual([
      'crypto:BTC',
      'future:BTC:long',
      'future:BTC:short',
    ])
    expect(slices.map((s) => s.name)).toEqual(['BTC', 'BTC long', 'BTC short'])
    expect(slices[1].subtitle).toBe('Perp')
    expect(slices[2].subtitle).toBe('Perp')
    expect(slices[1].value).toBe(40)
    expect(slices[1].color).not.toBe(slices[0].color)
    expect(slices[1].color).not.toBe(slices[2].color)
  })

  it('rolls both sides into one Future type slice', () => {
    const slices = buildTypeSlices([
      { symbol: 'BTC', marketValue: 100, asset_type: 'crypto' },
      { symbol: 'BTC', marketValue: 40, asset_type: 'future', positionSide: 'long' },
      { symbol: 'BTC', marketValue: 10, asset_type: 'future', positionSide: 'short' },
    ])
    const future = slices.find((s) => s.id === 'type:future')
    expect(future?.name).toBe('Future')
    expect(future?.value).toBe(50)
  })
})
