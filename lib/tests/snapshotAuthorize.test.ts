import { describe, expect, it } from 'vitest'
import { snapshotCallerAllowed } from '../../supabase/functions/portfolio-snapshots/authorize'

const secret = 'cron-secret-value'

describe('snapshotCallerAllowed', () => {
  it('rejects an empty secret, a missing header, and a wrong secret', async () => {
    expect(await snapshotCallerAllowed('', { cronSecret: secret, authorization: null })).toBe(false)
    expect(await snapshotCallerAllowed(secret, { cronSecret: null, authorization: null })).toBe(false)
    expect(await snapshotCallerAllowed(secret, { cronSecret: 'nope', authorization: null })).toBe(false)
    expect(
      await snapshotCallerAllowed(secret, { cronSecret: null, authorization: 'Bearer nope' }),
    ).toBe(false)
  })

  it('accepts x-cron-secret or a bearer token that matches', async () => {
    expect(await snapshotCallerAllowed(secret, { cronSecret: secret, authorization: null })).toBe(true)
    expect(
      await snapshotCallerAllowed(secret, {
        cronSecret: null,
        authorization: `Bearer ${secret}`,
      }),
    ).toBe(true)
    expect(
      await snapshotCallerAllowed(secret, {
        cronSecret: 'nope',
        authorization: `Bearer ${secret}`,
      }),
    ).toBe(true)
  })
})
