/**
 * Tax Calculation Agent — Finnish capital-gains specialist for the orchestrator.
 *
 * Uses estimateFinnishTax + lib/tax only. Never invents rates or filings.
 * Optional live mark / sellFraction from portfolio holdings.
 */

import 'server-only'

import { estimateFinnishTax } from '@/app/actions/tax/estimateTax'
import { getPortfolioData } from '@/lib/portfolioData'
import { buildTaxBrief, buildTaxSummary } from '@/lib/tax'
import {
  finishChildAgentRun,
  startChildAgentRun,
} from '@/lib/agents/runChildAgent'
import type {
  ChildAgentContext,
  TaxAgentInput,
  TaxAgentOutput,
} from '@/lib/agents/types'
import type { AgentToolRecord } from '@/lib/agentObservability'

const FEATURE = 'tax_agent'
const MODEL = 'estimateFinnishTax'

/**
 * Run the Tax Agent for the authenticated user context.
 */
export async function runTaxAgent(
  ctx: ChildAgentContext,
  input: TaxAgentInput
): Promise<TaxAgentOutput> {
  const startedAt = Date.now()
  const runId = await startChildAgentRun({
    userId: ctx.userId,
    feature: FEATURE,
    agentRole: 'tax',
    parentRunId: ctx.parentRunId,
    model: MODEL,
  })

  const toolTrace: AgentToolRecord[] = []

  try {
    let symbol = input.symbol?.trim().toUpperCase()
    let quantity = input.quantity
    let unitPrice = input.unitPrice
    let unitPriceCurrency = input.unitPriceCurrency

    const needsWhatIf =
      input.mode === 'hypothetical_sell' ||
      (input.mode === 'full' &&
        Boolean(symbol && (quantity !== undefined || input.sellFraction !== undefined)))

    if (needsWhatIf || input.sellFraction !== undefined || unitPrice === undefined) {
      const data = await getPortfolioData()
      if (!data.error) {
        // Resolve fraction of open position
        if (
          symbol &&
          quantity === undefined &&
          input.sellFraction !== undefined &&
          input.sellFraction > 0 &&
          input.sellFraction <= 1
        ) {
          const h = data.enrichedHoldings.find(
            (x) => x.symbol.toUpperCase() === symbol && x.asset_type !== 'cash'
          )
          if (h && h.quantity > 0) {
            quantity = Number((h.quantity * input.sellFraction).toFixed(8))
          }
        }

        // Live mark when price omitted for what-if
        if (
          needsWhatIf &&
          symbol &&
          quantity !== undefined &&
          unitPrice === undefined
        ) {
          const h = data.enrichedHoldings.find(
            (x) => x.symbol.toUpperCase() === symbol && x.asset_type !== 'cash'
          )
          if (h?.priceAvailable && h.currentPrice > 0) {
            unitPrice = h.currentPrice
            unitPriceCurrency =
              data.preferredCurrency === 'EUR' ? 'EUR' : 'USD'
          }
        }
      }
    }

    if (input.mode === 'hypothetical_sell') {
      if (!symbol || quantity === undefined) {
        const err =
          'Hypothetical sell requires symbol and quantity (or sellFraction of an open holding).'
        await finishError(runId, ctx, toolTrace, startedAt, err, {
          mode: input.mode,
          symbol: symbol ?? null,
        })
        return { ok: false, error: err, toolTrace }
      }
      if (unitPrice === undefined) {
        const err = `No live price for ${symbol}; pass unitPrice explicitly for the tax estimate.`
        await finishError(runId, ctx, toolTrace, startedAt, err, {
          mode: input.mode,
          symbol,
        })
        return { ok: false, error: err, toolTrace }
      }
    }

    const result = await estimateFinnishTax({
      mode: input.mode,
      taxYear: input.taxYear,
      symbol,
      quantity,
      unitPrice,
      unitPriceCurrency,
      otherCapitalIncomeEur: input.otherCapitalIncomeEur,
      sellingCostsEur: input.sellingCostsEur,
    })

    if ('error' in result) {
      toolTrace.push({
        name: 'estimate_finnish_tax',
        args: {
          mode: input.mode,
          taxYear: input.taxYear ?? null,
          symbol: symbol ?? null,
          quantity: quantity ?? null,
        },
        result: { error: result.error },
        ok: false,
        error: result.error,
      })
      await finishError(runId, ctx, toolTrace, startedAt, result.error, {})
      return { ok: false, error: result.error, toolTrace }
    }

    const brief = buildTaxBrief(result.data)
    const summary = buildTaxSummary(result.data)

    toolTrace.push({
      name: 'estimate_finnish_tax',
      args: {
        mode: input.mode,
        taxYear: summary.taxYear,
        symbol: symbol ?? null,
        quantity: quantity ?? null,
        unitPrice: unitPrice ?? null,
        unitPriceCurrency: unitPriceCurrency ?? null,
        sellFraction: input.sellFraction ?? null,
      },
      result: summary,
      ok: true,
    })

    await finishChildAgentRun({
      runId,
      status: 'success',
      tools: toolTrace,
      model: MODEL,
      durationMs: Date.now() - startedAt,
      stepCount: 1,
      parentRunId: ctx.parentRunId,
      agentRole: 'tax',
    })

    return {
      ok: true,
      brief,
      summary,
      toolTrace,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Tax agent failed'
    await finishError(runId, ctx, toolTrace, startedAt, msg, {})
    return { ok: false, error: msg, toolTrace }
  }
}

async function finishError(
  runId: string | null,
  ctx: ChildAgentContext,
  toolTrace: AgentToolRecord[],
  startedAt: number,
  errorSummary: string,
  args: Record<string, unknown>
) {
  if (toolTrace.length === 0) {
    toolTrace.push({
      name: 'estimate_finnish_tax',
      args,
      ok: false,
      error: errorSummary,
    })
  }
  await finishChildAgentRun({
    runId,
    status: 'error',
    tools: toolTrace,
    model: MODEL,
    durationMs: Date.now() - startedAt,
    errorSummary,
    parentRunId: ctx.parentRunId,
    agentRole: 'tax',
  })
}
