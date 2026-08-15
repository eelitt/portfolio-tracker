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
import { parseNewsContextHandoff } from '@/lib/agents/newsContext'
import { redactForStorage } from '@/lib/agentObservability'
import { toolDescription } from '@/lib/aiTools'

export type OrchestratorToolContext = {
  userId: string
  parentRunId: string | null
  /** Latest user message text (confirm gate + analyst routing). */
  lastUserText: string
  /** No writes / no live news refresh */
  dryRun?: boolean
}

/**
 * Build invoke_* tools bound to the current request (user + parent run).
 */
export function createOrchestratorTools(ctx: OrchestratorToolContext) {
  const childCtx = { userId: ctx.userId, parentRunId: ctx.parentRunId }
  /** Only news from a successful invoke_news_agent in THIS request may be handed off. */
  let newsOkThisRequest = false
  let lastNewsHandoff: NewsAgentOutput | null = null

  return {
    invoke_news_agent: tool({
      description: toolDescription('invoke_news_agent'),
      parameters: z.object({
        symbols: z
          .array(z.string())
          .optional()
          .describe(
            'Tickers to research (open holdings or watchlist). Omit for biggest holdings.'
          ),
        universe: z
          .enum(['holdings', 'watchlist'])
          .optional()
          .describe(
            'watchlist when the user asks about watchlist news; omit for holdings (default).'
          ),
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
          universe: args.universe,
          forceRefresh: ctx.dryRun ? false : args.forceRefresh,
          questionHint: args.questionHint,
          dryRun: ctx.dryRun,
        })
        if (out.ok && out.holdings?.length) {
          const handoff = parseNewsContextHandoff({
            ok: true,
            holdings: out.holdings,
            brief: out.brief,
            asOf: out.asOf,
            statusNote: out.statusNote,
          })
          if (handoff.ok) {
            newsOkThisRequest = true
            lastNewsHandoff = handoff.news
          }
        }
        // Content + optional statusNote. packageUpdated is for client dashboard sync only.
        return redactForStorage({
          ok: out.ok,
          error: out.error,
          brief: out.brief,
          asOf: out.asOf,
          holdings: out.holdings,
          statusNote: out.statusNote,
          packageUpdated: ctx.dryRun ? false : out.updatedCache === true,
          dryRun: ctx.dryRun || undefined,
        })
      },
    }),

    invoke_portfolio_analyst: tool({
      description: toolDescription('invoke_portfolio_analyst'),
      parameters: z.object({
        userMessage: z
          .string()
          .min(1)
          .optional()
          .describe(
            'Optional focus hint only. Logging/confirm always use the real last user message server-side.'
          ),
        task: z
          .enum(['answer', 'position_snapshot', 'prepare_trade'])
          .optional()
          .describe('answer=default; position_snapshot=compact position facts; prepare_trade=logging flow'),
        symbols: z.array(z.string()).optional(),
        newsContext: z
          .any()
          .optional()
          .describe(
            'Pass through structured output from invoke_news_agent in this turn only. Do not invent.'
          ),
      }),
      execute: async (args) => {
        let newsContext: NewsAgentOutput | undefined
        if (args.newsContext !== undefined && args.newsContext !== null) {
          if (!newsOkThisRequest || !lastNewsHandoff) {
            return redactForStorage({
              ok: false,
              error:
                'newsContext is only allowed after a successful invoke_news_agent in this request. Call the news agent first, or omit newsContext.',
            })
          }
          // Ignore model-shaped payload; only server-captured news from this request is trusted
          newsContext = lastNewsHandoff
        }

        // Ground specialist on the real user message (prepare/confirm consistency)
        const groundedUserMessage = ctx.lastUserText

        const out = await runPortfolioAnalystAgent(childCtx, {
          userMessage: groundedUserMessage,
          task: args.task,
          symbols: args.symbols,
          newsContext,
          lastUserText: ctx.lastUserText,
          dryRun: ctx.dryRun,
        })
        return redactForStorage({
          ok: out.ok,
          text: out.text,
          error: out.error,
          toolNames: out.toolTrace.map((t) => t.name),
          transactionSaved: ctx.dryRun ? false : out.transactionSaved,
          transactionError: out.transactionError,
          watchlistChanged: ctx.dryRun ? false : out.watchlistChanged,
          dryRun: ctx.dryRun || undefined,
        })
      },
    }),

    invoke_tax_agent: tool({
      description: toolDescription('invoke_tax_agent'),
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
      description: toolDescription('invoke_portfolio_analysis_agent'),
      parameters: z.object({
        questionHint: z
          .string()
          .optional()
          .describe('Optional focus from the user question'),
      }),
      execute: async () => {
        const out = await runPortfolioAnalysisAgent(childCtx, {
          dryRun: ctx.dryRun === true,
        })
        return redactForStorage({
          ok: out.ok,
          error: out.error,
          brief: out.brief,
          insights: out.insights,
          asOf: out.asOf,
          statusNote: out.statusNote,
          packageUpdated: ctx.dryRun ? false : out.packageUpdated === true,
          failureMode: out.failureMode,
          recovery: out.recovery,
          dryRun: ctx.dryRun || out.dryRun || undefined,
        })
      },
    }),
  }
}
