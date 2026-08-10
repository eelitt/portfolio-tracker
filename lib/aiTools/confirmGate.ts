/**
 * Pure confirm-message gates for NL transaction logging.
 * Lives in lib/ so enforce + tools share one source (no app → lib inversion).
 */

/**
 * True only when the latest user message is a short explicit confirm.
 * Blocks confirm_transaction during analysis / multi-intent / jailbreak messages.
 */
export function isExplicitConfirmMessage(text: string): boolean {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/g, '')
    .trim()
  if (!t) return false

  const exact = new Set([
    'confirm',
    'yes',
    'y',
    'ok',
    'okay',
    'log it',
    'save it',
    'save',
    'do it',
    'proceed',
    'go ahead',
    'yes log it',
    'yes, log it',
    'please confirm',
  ])
  if (exact.has(t)) return true

  return /^(yes|confirm|ok|okay)(,?\s+(please|log it|save it|do it))?$/.test(t)
}

/**
 * Elevated confirm for warned prepares (e.g. sell exceeds holdings).
 * Bare "yes" is not enough.
 */
export function isElevatedConfirmMessage(text: string): boolean {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/g, '')
    .trim()
  if (!t) return false

  const exact = new Set([
    'confirm sell',
    'confirm trade',
    'confirm anyway',
    'yes confirm sell',
    'yes, confirm sell',
    'confirm despite warning',
    'confirm with warnings',
  ])
  if (exact.has(t)) return true

  return /^(yes,?\s+)?confirm(\s+(sell|trade|anyway|with warnings|despite warning))$/.test(
    t
  )
}

/**
 * Whether the user message satisfies the required confirm level for a write.
 */
export function messageSatisfiesConfirmLevel(
  text: string,
  level: 'hard' | 'elevated_hard'
): boolean {
  if (level === 'elevated_hard') {
    return isElevatedConfirmMessage(text)
  }
  return isExplicitConfirmMessage(text)
}
