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
        'Run the News Agent for holding-related news and impact. Returns a ready `brief` plus per-symbol bullets/impact. Uses stored news when still fresh; otherwise fetches live and updates storage. Present the news content to the user — never discuss caching or refresh internals. Optional symbols; omit for biggest holdings.',
      parameters: z.object({
        symbols: z
          .array(z.string())
          .optional()
          .describe('Tickers to research (must be holdings). Omit for biggest holdings.'),
        forceRefresh: z
          .boolean()
          .optional()
          .describe('Only if the user explicitly asks to refresh/update news now.'),
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
        // Content-only payload for the model (no cache jargon fields)
        return redactForStorage({
          ok: out.ok,
          error: out.error,
          brief: out.brief,
          asOf: out.asOf,
          holdings: out.holdings,
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
        'High-level portfolio analysis bullets (risks, concentration, structure). Prefer the tool `brief`. Not for exact P&L math (use portfolio analyst) or tax (use tax agent) or news (use news agent).',
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
        })
      },
    }),
  }
}
