import { describe, expect, it } from 'vitest'
import {
  LOG_SUBJECT_MAX,
  callerLabel,
  logSubject,
  newsLogSubject,
} from '@/lib/agentObservability/caller'

describe('callerLabel', () => {
  it('shows the email when Auth has one', () => {
    expect(callerLabel('ada@example.com', 'user-1')).toBe('ada@example.com')
  })

  it('shows the user id when the email is missing', () => {
    expect(callerLabel(null, 'user-1')).toBe('user-1')
    expect(callerLabel('  ', 'user-1')).toBe('user-1')
    expect(callerLabel(undefined, 'user-1')).toBe('user-1')
  })
})

describe('logSubject', () => {
  it('stores nothing when no subject was passed', () => {
    expect(logSubject(undefined)).toBeUndefined()
    expect(logSubject(null)).toBeUndefined()
    expect(logSubject('   ')).toBeUndefined()
  })

  it('truncates a long subject', () => {
    const long = 'A'.repeat(LOG_SUBJECT_MAX + 20)
    expect(logSubject(long)).toHaveLength(LOG_SUBJECT_MAX)
  })

  it('joins news symbols into one line', () => {
    expect(newsLogSubject([' BTC ', '', 'ETH'])).toBe('BTC, ETH')
    expect(newsLogSubject([])).toBeUndefined()
  })
})
