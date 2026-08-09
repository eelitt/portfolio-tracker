/**
 * Orchestrator tools: invoke specialist agents only (no portfolio math / news / tax math here).
 */

import { tool } from 'ai'
import { z } from 'zod'
import { runNewsAgent } from '@/app/actions/ai/holding-news/agent'
import { runPortfolioAnalystAgent } from '@/app/actions/ai/portfolio-analyst/agent'
import { runTaxAgent } from '@/app/actions/ai/tax/agent'
import { runPortfolioAnalysisAgent } from '@/app/actions/ai/portfolio-insights/agent'
import type { NewsAgentOutput } from '@/lib/agents/types'
import { redactForStorage } from '@/lib/agentObservability'

export type OrchestratorToolContext = {
  userId: string
  parentRunId: string | null
  /** Latest user message text (confirm gate + analyst routing). */
  lastUserText: string
}

/**
 * Build invoke_* tools bound to the current request (user + parent run).
 */
export function createOrchestratorTools(ctx: OrchestratorToolContext) {
  const childCtx = { userId: ctx.userId, parentRunId: ctx.parentRunId }

  return {
    invoke_news_agent: tool({
      description:
        'Run the News Agent for holding-related news and impact (same pipeline/limits as the Holdings dashboard icon). Returns `brief` plus per-symbol bullets/impact. Optional symbols; omit for biggest holdings. Set forceRefresh true only when the user explicitly asks to fetch/refresh/update/get latest news. Prefer `brief`; if `statusNote` is present, include it briefly for the user.',
      parameters: z.object({
        symbols: z
          .array(z.string())
          .optional()
          .describe('Tickers to research (must be holdings). Omit for biggest holdings.'),
        forceRefresh: z
          .boolean()
          .optional()
          .describe(
            'True when user explicitly asks to fetch/refresh/update/get latest news (popover Fetch parity). False/omit for casual "any news?" questions.'
          ),
        questionHint: z
          .string()
          .optional()
          .describe('Short hint from the user question for ranking focus.'),
      }),
      execute: async (args) => {
        const out = await runNewsAgent(childCtx, {
          symbols: args.symbols,
          forceRefresh: args.forceRefresh,
          questionHint: args.questionHint,
        })
        // Content + optional statusNote. packageUpdated is for client dashboard sync only.
        return redactForStorage({
          ok: out.ok,
          error: out.error,
          brief: out.brief,
          asOf: out.asOf,
          holdings: out.holdings,
          statusNote: out.statusNote,
          packageUpdated: out.updatedCache === true,
        })
      },
    }),

    invoke_portfolio_analyst: tool({
      description:
        'Run the Portfolio Analyst specialist for holdings, P&L, allocation, scenarios, or transaction logging. Not for tax math (use invoke_tax_agent). Pass newsContext only from News Agent output. For confirm/logging, pass the user’s exact words as userMessage.',
      parameters: z.object({
        userMessage: z
          .string()
          .min(1)
          .describe('Question or instruction for the analyst (often the user message).'),
        task: z
          .enum(['answer', 'position_snapshot', 'prepare_trade'])
          .optional()
          .describe('answer=default; position_snapshot=compact position facts; prepare_trade=logging flow'),
        symbols: z.array(z.string()).optional(),
        newsContext: z
          .any()
          .optional()
          .describe('Optional structured output from invoke_news_agent (pass through, do not invent).'),
      }),
      execute: async (args) => {
        const out = await runPortfolioAnalystAgent(childCtx, {
          userMessage: args.userMessage,
          task: args.task,
          symbols: args.symbols,
          newsContext: args.newsContext as NewsAgentOutput | undefined,
          lastUserText: ctx.lastUserText,
        })
        return redactForStorage({
          ok: out.ok,
          text: out.text,
          error: out.error,
          toolNames: out.toolTrace.map((t) => t.name),
          transactionSaved: out.transactionSaved,
          transactionError: out.transactionError,
        })
      },
    }),

    invoke_tax_agent: tool({
      description:
        'Finnish capital-gains tax estimate (luovutusvoitto): FIFO + weighted average vs hankintameno-olettama. Use for tax / CGT questions. Prefer the tool `brief`. Never invent tax figures. Modes: ytd (logged sells this year), hypothetical_sell (what-if), full (YTD + optional what-if). For “sell half of X” pass sellFraction 0.5 with symbol.',
      parameters: z.object({
        mode: z
          .enum(['hypothetical_sell', 'ytd', 'full'])
          .describe('ytd | hypothetical_sell | full'),
        taxYear: z
          .number()
          .int()
          .optional()
          .describe('Calendar tax year (default current UTC year)'),
        symbol: z.string().optional().describe('Ticker for what-if sell'),
        quantity: z.number().positive().optional().describe('Absolute quantity to sell hypothetically'),
        sellFraction: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe('Fraction of open holding (e.g. 0.5) when quantity unknown'),
        unitPrice: z
          .number()
          .min(0)
          .optional()
          .describe('Mark price; if omitted for what-if, live holding price is used when available'),
        unitPriceCurrency: z.enum(['USD', 'EUR']).optional(),
        otherCapitalIncomeEur: z
          .number()
          .min(0)
          .optional()
          .describe('Other taxable capital income this year in EUR (default 0)'),
        sellingCostsEur: z.number().min(0).optional(),
        questionHint: z.string().optional(),
      }),
      execute: async (args) => {
        const out = await runTaxAgent(childCtx, {
          mode: args.mode,
          taxYear: args.taxYear,
          symbol: args.symbol,
          quantity: args.quantity,
          sellFraction: args.sellFraction,
          unitPrice: args.unitPrice,
          unitPriceCurrency: args.unitPriceCurrency,
          otherCapitalIncomeEur: args.otherCapitalIncomeEur,
          sellingCostsEur: args.sellingCostsEur,
          questionHint: args.questionHint,
        })
        return redactForStorage({
          ok: out.ok,
          error: out.error,
          brief: out.brief,
          summary: out.summary,
        })
      },
    }),

    invoke_portfolio_analysis_agent: tool({
      description:
        'High-level portfolio analysis bullets (risks, concentration, structure). Same pipeline/limits as the Summary dashboard icon. Prefer `brief`; if `statusNote` is present, include it briefly. Not for exact P&L math (use portfolio analyst) or tax (use tax agent) or news (use news agent).',
      parameters: z.object({
        questionHint: z
          .string()
          .optional()
          .describe('Optional focus from the user question'),
      }),
      execute: async () => {
        const out = await runPortfolioAnalysisAgent(childCtx, {})
        return redactForStorage({
          ok: out.ok,
          error: out.error,
          brief: out.brief,
          insights: out.insights,
          asOf: out.asOf,
          statusNote: out.statusNote,
        })
      },
    }),
  }
}
