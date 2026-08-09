/**
 * Confirmation levels for portfolio mutations.
 * Soft = warn user; hard = must explicit confirm before write.
 */

export type ConfirmLevel = 'none' | 'soft' | 'hard'

/**
 * Prepare path: soft when there are warnings (e.g. sell exceeds holding),
 * hard when ready without warnings (user still must confirm to write).
 */
export function confirmLevelForPrepare(args: {
  status: string
  warnings: string[]
}): ConfirmLevel {
  if (args.status !== 'ready') return 'none'
  if (args.warnings.length > 0) return 'soft'
  return 'hard'
}

/** Write tool always hard. */
export const CONFIRM_LEVEL_WRITE: ConfirmLevel = 'hard'
