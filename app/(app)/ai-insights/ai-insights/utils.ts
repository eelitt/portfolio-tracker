export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString)
  const diffMs = date.getTime() - Date.now()
  const absMs = Math.abs(diffMs)
  const past = diffMs <= 0

  const diffSec = Math.floor(absMs / 1000)
  if (diffSec < 5) return past ? 'just now' : 'in a moment'
  if (diffSec < 60) {
    return past
      ? `${diffSec} seconds ago`
      : `in ${diffSec} seconds`
  }
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) {
    return past
      ? `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`
      : `in ${diffMin} minute${diffMin > 1 ? 's' : ''}`
  }
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 48) {
    return past
      ? `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
      : `in ${diffHours} hour${diffHours > 1 ? 's' : ''}`
  }
  const diffDays = Math.floor(diffHours / 24)
  return past
    ? `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    : `in ${diffDays} day${diffDays > 1 ? 's' : ''}`
}
