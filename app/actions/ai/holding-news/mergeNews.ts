export function symbolHasBullets(
  bullets: string[] | null | undefined
): boolean {
  return Array.isArray(bullets) && bullets.some((b) => String(b).trim().length > 0)
}

export function newsHasAnyBullets(
  news: Record<string, string[]> | null | undefined
): boolean {
  if (!news) return false
  return Object.values(news).some(symbolHasBullets)
}

export function isUncoveredSymbol(
  symbol: string,
  previousNews: Record<string, string[]> | null | undefined
): boolean {
  if (!previousNews) return true
  const upper = symbol.toUpperCase()
  if (Object.prototype.hasOwnProperty.call(previousNews, symbol)) return false
  if (Object.prototype.hasOwnProperty.call(previousNews, upper)) return false
  for (const key of Object.keys(previousNews)) {
    if (key.toUpperCase() === upper) return false
  }
  return true
}

export function hasUncoveredHoldings(
  selectedSymbols: string[],
  previousNews: Record<string, string[]> | null | undefined
): boolean {
  return selectedSymbols.some((s) => isUncoveredSymbol(s, previousNews))
}

export function symbolsEligibleForExtendedLookback(
  selectedSymbols: string[],
  previousNews: Record<string, string[]> | null | undefined,
  afterPassNews: Record<string, string[]>
): string[] {
  return selectedSymbols.filter(
    (s) =>
      isUncoveredSymbol(s, previousNews) && !symbolHasBullets(afterPassNews[s])
  )
}

export function symbolNewsFingerprint(
  bullets: string[] | null | undefined
): string {
  if (!Array.isArray(bullets)) return ''
  return bullets
    .map((b) => String(b).trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|')
}

export type HoldingNewsMergeResult = {
  news: Record<string, string[]>
  changedSymbols: string[]
  firstFillCount: number
  updateCount: number
  keptCount: number
  emptyCount: number
}

export function mergeHoldingNews(
  previous: Record<string, string[]> | null | undefined,
  incoming: Record<string, string[]>,
  symbols: string[]
): HoldingNewsMergeResult {
  const prev = previous ?? {}
  const news: Record<string, string[]> = {}
  const changedSymbols: string[] = []
  let firstFillCount = 0
  let updateCount = 0
  let keptCount = 0
  let emptyCount = 0

  for (const symbol of symbols) {
    const prevBullets = prev[symbol] ?? prev[symbol.toUpperCase()] ?? []
    const nextBullets = incoming[symbol] ?? []
    const hadPrev = symbolHasBullets(prevBullets)
    const hasNext = symbolHasBullets(nextBullets)

    if (!hadPrev) {
      if (hasNext) {
        news[symbol] = nextBullets
        changedSymbols.push(symbol)
        firstFillCount++
      } else {
        news[symbol] = []
        emptyCount++
      }
      continue
    }

    if (
      !hasNext ||
      symbolNewsFingerprint(prevBullets) === symbolNewsFingerprint(nextBullets)
    ) {
      news[symbol] = prevBullets
      keptCount++
    } else {
      news[symbol] = nextBullets
      changedSymbols.push(symbol)
      updateCount++
    }
  }

  return {
    news,
    changedSymbols,
    firstFillCount,
    updateCount,
    keptCount,
    emptyCount,
  }
}

export function buildHoldingNewsMergeMessage(
  merge: HoldingNewsMergeResult
): string | undefined {
  const { firstFillCount, updateCount, keptCount, emptyCount, changedSymbols } =
    merge
  if (changedSymbols.length === 0) {
    if (keptCount > 0) {
      return 'No material new headlines for holdings that already had news. Showing previous news where available.'
    }
    if (emptyCount > 0) {
      return 'No material news found in this period for your holdings.'
    }
    return undefined
  }
  const parts: string[] = []
  if (firstFillCount > 0) {
    parts.push(
      firstFillCount === 1
        ? 'Added news for a new holding'
        : `Added news for ${firstFillCount} holdings`
    )
  }
  if (updateCount > 0) {
    parts.push(
      updateCount === 1
        ? 'updated one holding'
        : `updated ${updateCount} holdings`
    )
  }
  if (keptCount > 0) {
    parts.push('others unchanged')
  }
  if (parts.length === 0) return undefined
  const text = parts.join('; ')
  return text.charAt(0).toUpperCase() + text.slice(1) + '.'
}
