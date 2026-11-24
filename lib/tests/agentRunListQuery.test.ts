import { describe, expect, it } from 'vitest'
import {
  agentRunListFilters,
  localDayBound,
} from '@/lib/agentObservability/runListQuery'

describe('agentRunListFilters', () => {
  it('returns no fields when nothing was set', () => {
    expect(agentRunListFilters({})).toEqual({})
    expect(
      agentRunListFilters({
        userId: '  ',
        feature: '',
        status: '',
        from: '   ',
        to: undefined,
      })
    ).toEqual({})
  })

  it('drops an unknown status and a blank feature', () => {
    expect(
      agentRunListFilters({
        userId: ' user-1 ',
        feature: '   ',
        status: 'cancelled',
      })
    ).toEqual({ userId: 'user-1' })
  })

  it('keeps a known status and ISO bounds', () => {
    expect(
      agentRunListFilters({
        feature: ' csv_import ',
        status: 'error',
        from: '2026-11-01T00:00:00.000Z',
        to: '2026-11-24T21:59:59.999Z',
      })
    ).toEqual({
      feature: 'csv_import',
      status: 'error',
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-11-24T21:59:59.999Z',
    })
  })

  it('drops a date that does not parse', () => {
    expect(
      agentRunListFilters({
        from: 'not-a-date',
        to: '2026-13-40',
        status: 'success',
      })
    ).toEqual({ status: 'success' })
  })
})

describe('localDayBound', () => {
  it('uses the admin local calendar day', () => {
    const start = localDayBound('2026-11-24', 'start')
    const end = localDayBound('2026-11-24', 'end')
    expect(start).toBeDefined()
    expect(end).toBeDefined()
    const startDate = new Date(start!)
    const endDate = new Date(end!)
    expect(startDate.getFullYear()).toBe(2026)
    expect(startDate.getMonth()).toBe(10)
    expect(startDate.getDate()).toBe(24)
    expect(startDate.getHours()).toBe(0)
    expect(endDate.getDate()).toBe(24)
    expect(endDate.getHours()).toBe(23)
    expect(startDate.getTime()).toBeLessThan(endDate.getTime())
  })

  it('drops a day that is not a real calendar day', () => {
    expect(localDayBound('2026-02-31', 'start')).toBeUndefined()
    expect(localDayBound('11/24/2026', 'end')).toBeUndefined()
  })
})
