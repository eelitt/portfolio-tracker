export type NewsBriefHolding = {
  symbol: string
  bullets: string[]
  impact?: { tone: string; outlook: string; points?: string[] }
}

export function buildNewsBrief(holdings: NewsBriefHolding[]): string {
  if (holdings.length === 0) {
    return 'No holdings available to report news for.'
  }

  const toneRank = (tone?: string) => {
    const t = (tone || '').toLowerCase()
    if (t === 'negative') return 0
    if (t === 'mixed') return 1
    if (t === 'positive') return 2
    return 3
  }

  const sorted = [...holdings].sort((a, b) => {
    const aHas = a.bullets.length > 0 ? 0 : 1
    const bHas = b.bullets.length > 0 ? 0 : 1
    if (aHas !== bHas) return aHas - bHas
    return toneRank(a.impact?.tone) - toneRank(b.impact?.tone)
  })

  const withNews = sorted.filter((h) => h.bullets.length > 0)
  if (withNews.length === 0) {
    const syms = sorted.map((h) => h.symbol).join(', ')
    return `No material headlines found for your holdings (${syms}) in the recent coverage window.`
  }

  const parts: string[] = ['Notable items for your holdings:']
  for (const h of sorted) {
    if (h.bullets.length === 0) {
      parts.push(`\n**${h.symbol}** — No recent items.`)
      continue
    }
    const lines = h.bullets.map((b) => `  • ${b}`).join('\n')
    let block = `\n**${h.symbol}**\n${lines}`
    if (h.impact?.outlook) {
      block += `\n  Outlook (${h.impact.tone}): ${h.impact.outlook}`
    }
    parts.push(block)
  }
  return parts.join('\n').trim()
}
