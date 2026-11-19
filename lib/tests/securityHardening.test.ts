import { describe, expect, it } from 'vitest'
import {
  AUTH_CONFIG_MESSAGE,
  AUTH_NETWORK_MESSAGE,
  LOGIN_FAILURE_MESSAGE,
  SIGNUP_FAILURE_MESSAGE,
  authScreenMessage,
} from '@/lib/authErrors'
import { aiCooldownOrFilter } from '@/lib/aiCooldown'
import {
  buildAdminAccessEvent,
  describeAdminAccessChange,
} from '@/lib/adminAccessEvent'
import { analystRateLimitError } from '@/lib/analystRateCopy'
import { MIN_PASSWORD_LENGTH, changePasswordSchema } from '@/lib/schemas'

describe('authScreenMessage', () => {
  it('hides whether an email is registered', () => {
    expect(
      authScreenMessage({ message: 'User already registered' }, 'signup')
    ).toBe(SIGNUP_FAILURE_MESSAGE)
    expect(
      authScreenMessage({ message: 'Invalid login credentials' }, 'login')
    ).toBe(LOGIN_FAILURE_MESSAGE)
  })

  it('keeps network and configuration failures distinct', () => {
    expect(authScreenMessage({ message: 'Failed to fetch' }, 'login')).toBe(
      AUTH_NETWORK_MESSAGE
    )
    expect(authScreenMessage({ code: 'ENOTFOUND' }, 'signup')).toBe(
      AUTH_NETWORK_MESSAGE
    )
    expect(
      authScreenMessage({ message: 'Invalid API key' }, 'login')
    ).toBe(AUTH_CONFIG_MESSAGE)
  })
})

describe('password length', () => {
  it('rejects 11 characters and accepts 12', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12)
    expect('elevenchars'.length).toBe(11)
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'oldpassword1',
        newPassword: 'elevenchars',
        confirmPassword: 'elevenchars',
      }).success
    ).toBe(false)
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'oldpassword1',
        newPassword: 'newpassword1',
        confirmPassword: 'newpassword1',
      }).success
    ).toBe(true)
  })
})

describe('admin access audit', () => {
  it('builds the stored row and a short change label', () => {
    const row = buildAdminAccessEvent({
      actorId: 'actor',
      targetUserId: 'target',
      previousAdmin: false,
      nextAdmin: true,
      previousAccess: false,
      nextAccess: true,
    })
    expect(row).toEqual({
      actor_id: 'actor',
      target_user_id: 'target',
      previous_admin: false,
      next_admin: true,
      previous_access: false,
      next_access: true,
    })
    expect(
      describeAdminAccessChange({
        previousAdmin: false,
        nextAdmin: true,
        previousAccess: false,
        nextAccess: true,
      })
    ).toBe('admin off to on, access off to on')
    expect(
      describeAdminAccessChange({
        previousAdmin: true,
        nextAdmin: true,
        previousAccess: true,
        nextAccess: true,
      })
    ).toBe('')
  })
})

describe('rate limit copy', () => {
  it('quotes the timestamp in the cooldown filter', () => {
    expect(aiCooldownOrFilter('2026-11-19T12:00:00.000Z')).toBe(
      'last_ai_call_at.is.null,last_ai_call_at.lt."2026-11-19T12:00:00.000Z"'
    )
  })

  it('formats chat limit waits', () => {
    expect(analystRateLimitError('gap', 1500)).toBe(
      'Please wait 2 seconds before sending another message.'
    )
    expect(analystRateLimitError('window', 90_000)).toBe(
      'Rate limit reached (30 messages / 15 min). Try again in about 2 minute(s).'
    )
  })
})
