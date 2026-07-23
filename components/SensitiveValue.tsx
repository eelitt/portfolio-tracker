'use client'

import { usePrivacyMode } from '@/app/(app)/privacy/PrivacyModeProvider'
import { MONEY_MASK } from '@/lib/privacyMode'
import { cn } from '@/lib/utils'

interface SensitiveValueProps {
  /** Already-formatted currency (or money) string. */
  value: string
  className?: string
}

/**
 * Renders a money string, or password-style dots when privacy mode is on.
 * Safe to embed in Server Components as a client island.
 */
export default function SensitiveValue({ value, className }: SensitiveValueProps) {
  const { hideMoney } = usePrivacyMode()

  if (hideMoney) {
    return (
      <span
        className={cn('tracking-widest tabular-nums select-none', className)}
        aria-label="Amount hidden"
        title="Amount hidden"
      >
        {MONEY_MASK}
      </span>
    )
  }

  return <span className={className}>{value}</span>
}
