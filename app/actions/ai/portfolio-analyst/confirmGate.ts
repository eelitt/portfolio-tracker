/**
 * Pure confirm-message gate for NL transaction logging.
 * Kept free of server-only imports so Vitest can load it.
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
