/**
 * Confirmation levels for portfolio mutations.
 * elevated_hard = warned draft needs stronger confirm phrase before write.
 */

export type ConfirmLevel = 'none' | 'soft' | 'hard' | 'elevated_hard'

/**
 * Prepare path:
 * - elevated_hard when warnings (e.g. sell exceeds holding)
 * - hard when ready without warnings
 * - none when not ready
 */
export function confirmLevelForPrepare(args: {
  status: string
  warnings: string[]
}): ConfirmLevel {
  if (args.status !== 'ready') return 'none'
  if (args.warnings.length > 0) return 'elevated_hard'
  return 'hard'
}

/** Successful write path is always at least hard. */
export const CONFIRM_LEVEL_WRITE: ConfirmLevel = 'hard'

export function needsElevatedConfirm(level: ConfirmLevel): boolean {
  return level === 'elevated_hard' || level === 'soft'
}
