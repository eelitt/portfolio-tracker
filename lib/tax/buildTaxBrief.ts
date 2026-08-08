/**
 * Deterministic user-facing tax brief for the orchestrator / chat.
 * No filing advice; no internal plumbing jargon.
 */

import type { FinnishTaxEstimateResult } from './types'
import { roundMoney } from './progressiveTax'

function eur(n: number): string {
  return `€${roundMoney(n).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Compact markdown brief from a full estimate result.
 */
export function buildTaxBrief(result: FinnishTaxEstimateResult): string {
  const fifo = result.methods.fifo
  const wavg = result.methods.weightedAverage
  const cheaper = result.comparison.cheaperMethod
  const cheaperLabel =
    cheaper === 'tie'
      ? 'Both methods produce the same estimated tax'
      : cheaper === 'fifo'
        ? 'Lower estimated tax: FIFO'
        : 'Lower estimated tax: weighted average'

  const lines: string[] = [
    `Finnish capital-gains estimate · tax year ${result.taxYear} · mode \`${result.mode}\` · rates ${result.ratesYearLabel}`,
    `Other capital income assumed: ${eur(result.otherCapitalIncomeEur)}`,
    '',
    `**FIFO:** tax ${eur(fifo.estimatedTaxEur)} · taxable base ${eur(fifo.taxableBaseEur)} · net G/L ${eur(fifo.netGainOrLossEur)}${fifo.usedHmoOnAnyDisposal ? ' · HMO used on ≥1 disposal' : ''}`,
    `**Weighted average:** tax ${eur(wavg.estimatedTaxEur)} · taxable base ${eur(wavg.taxableBaseEur)} · net G/L ${eur(wavg.netGainOrLossEur)}${wavg.usedHmoOnAnyDisposal ? ' · HMO used on ≥1 disposal' : ''}`,
    `${cheaperLabel}${result.comparison.taxDeltaEur > 0 ? ` (delta ${eur(result.comparison.taxDeltaEur)})` : ''}`,
  ]

  const disposals = fifo.disposals
  if (disposals.length === 0) {
    lines.push('', 'No disposals in scope for this estimate (no sells in year and/or no what-if).')
  } else {
    lines.push('', `Disposals in scope: ${disposals.length}`)
    for (const d of disposals.slice(0, 3)) {
      const tag = d.isHypothetical ? ' (what-if)' : ''
      lines.push(
        `  • ${d.assetKey}${tag}: qty ${d.quantity} · proceeds ${eur(d.proceedsEur)} · taxable G/L ${eur(d.taxableGainOrLossEur)} · basis ${d.basisUsed}`
      )
    }
    if (disposals.length > 3) {
      lines.push(`  • …and ${disposals.length - 3} more`)
    }
  }

  if (result.smallDisposal.mayBeTaxFree) {
    lines.push('', `Small-disposal note: ${result.smallDisposal.note}`)
  }

  lines.push(
    '',
    'Estimate only — not tax advice and not a filing. Confirm with a tax professional or official guidance before acting.'
  )

  return lines.join('\n')
}

/** Compact summary object for tool payloads (no full disposal lists). */
export function buildTaxSummary(result: FinnishTaxEstimateResult) {
  return {
    taxYear: result.taxYear,
    mode: result.mode,
    ratesYearLabel: result.ratesYearLabel,
    otherCapitalIncomeEur: result.otherCapitalIncomeEur,
    fifo: {
      estimatedTaxEur: result.methods.fifo.estimatedTaxEur,
      taxableBaseEur: result.methods.fifo.taxableBaseEur,
      netGainOrLossEur: result.methods.fifo.netGainOrLossEur,
      usedHmo: result.methods.fifo.usedHmoOnAnyDisposal,
    },
    weightedAverage: {
      estimatedTaxEur: result.methods.weightedAverage.estimatedTaxEur,
      taxableBaseEur: result.methods.weightedAverage.taxableBaseEur,
      netGainOrLossEur: result.methods.weightedAverage.netGainOrLossEur,
      usedHmo: result.methods.weightedAverage.usedHmoOnAnyDisposal,
    },
    comparison: {
      lowerTaxMethod: result.comparison.cheaperMethod,
      taxDeltaEur: result.comparison.taxDeltaEur,
    },
    disposalCount: result.methods.fifo.disposals.length,
  }
}
