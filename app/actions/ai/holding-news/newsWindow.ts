import { HOLDING_NEWS_MAX_LOOKBACK_DAYS } from './constants'

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function computeNewsWindowDays(lookbackDays: number): {
  fromDate: string
  toDate: string
  lookbackDays: number
} {
  const days = Math.max(1, Math.floor(lookbackDays))
  const to = new Date()
  const toDate = toISODate(to)
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - days)
  return { fromDate: toISODate(from), toDate, lookbackDays: days }
}

export function computeNewsWindow(lastFetchedAt: Date | null): {
  fromDate: string
  toDate: string
  lookbackDays: number
} {
  let lookbackDays = HOLDING_NEWS_MAX_LOOKBACK_DAYS
  if (lastFetchedAt) {
    const elapsedMs = Date.now() - lastFetchedAt.getTime()
    const elapsedDays = Math.max(1, Math.ceil(elapsedMs / (24 * 60 * 60 * 1000)))
    lookbackDays = Math.min(HOLDING_NEWS_MAX_LOOKBACK_DAYS, elapsedDays)
  }
  return computeNewsWindowDays(lookbackDays)
}
