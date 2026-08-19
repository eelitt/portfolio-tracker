export function saveErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const first = Object.values(error as Record<string, string[]>)[0]
    if (Array.isArray(first) && first[0]) return first[0]
  }
  return 'Failed to save goal'
}
