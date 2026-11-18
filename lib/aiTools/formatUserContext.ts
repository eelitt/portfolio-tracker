/**
 * Prompt text for the orchestrator user-context pack.
 * Pure: no I/O. Balances stay out of this block; the analyst tools own them.
 */

import type { UserContextPack } from './types'

/** Compact markdown block for system prompt injection (token-bounded). */
export function formatUserContextForPrompt(pack: UserContextPack): string {
  const lines: string[] = [
    '## User context (trusted server pack — do not invent beyond this + tools)',
    `- Preferred currency: **${pack.preferredCurrency}**`,
  ]

  if (pack.investorOneLiner) {
    lines.push(`- Investor: ${pack.investorOneLiner}`)
  } else {
    lines.push('- Investor profile: not set')
  }
  if (pack.targetOneLiner) {
    lines.push(`- ${pack.targetOneLiner}`)
  } else {
    lines.push('- Target allocation: not set')
  }

  if (pack.goals.length > 0) {
    lines.push('- Goals:')
    for (const g of pack.goals) {
      const done = g.isCompleted ? 'done' : 'open'
      const date = g.targetDate ? `, date ${g.targetDate}` : ''
      const pmt =
        g.plannedMonthly != null ? `, planned ${g.plannedMonthly}/mo` : ''
      lines.push(`  • ${g.name} (target ${g.targetAmount}${date}${pmt}, ${done})`)
    }
  } else {
    lines.push('- Goals: none set')
  }

  if (pack.lastAnalysis) {
    lines.push(
      `- Last portfolio analysis (${pack.lastAnalysis.asOf ?? 'unknown time'}):`
    )
    for (const b of pack.lastAnalysis.bullets) {
      lines.push(`  • ${b}`)
    }
  } else {
    lines.push('- Last portfolio analysis: none stored yet')
  }

  if (pack.lastNews) {
    lines.push(
      `- Last holding-news package: ${pack.lastNews.symbolCount} symbol(s), as of ${pack.lastNews.asOf ?? 'unknown'}`
    )
  } else {
    lines.push('- Last holding-news package: none stored yet')
  }

  lines.push(
    '- Money writes: only via prepare → user confirm → confirm_transaction (never invent trades).'
  )
  lines.push(
    '- Watchlist add/remove: execute on that turn (no second confirm); never invent tickers.'
  )

  return lines.join('\n')
}
