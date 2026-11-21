import { describe, expect, it } from 'vitest'
import { pickOverviewRows } from '@/lib/agentObservability/overviewRows'

describe('pickOverviewRows', () => {
  it('keeps the window when it has rows', () => {
    expect(pickOverviewRows([{ id: 'w' }], [{ id: 'l' }])).toEqual({
      rows: [{ id: 'w' }],
      outsideWindow: false,
    })
  })

  it('uses the latest rows when the window is empty', () => {
    expect(pickOverviewRows([], [{ id: 'l' }])).toEqual({
      rows: [{ id: 'l' }],
      outsideWindow: true,
    })
  })

  it('stays empty when the table has no rows', () => {
    expect(pickOverviewRows([], [])).toEqual({
      rows: [],
      outsideWindow: false,
    })
  })
})
