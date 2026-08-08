/**
 * Orchestrator tools: invoke specialist agents only (no portfolio math / no news fetch here).
 */

import { tool } from 'ai'
import { z } from 'zod'
import { runNewsAgent } from '@/app/actions/ai/holding-news/agent'
import { runPortfolioAnalystAgent } from '@/app/actions/ai/portfolio-analyst/agent'
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
        'Run the Portfolio Analyst specialist for numbers, scenarios, tax estimates, or transaction logging. Pass newsContext only when you already have News Agent structured output (do not invent it). For confirm/logging, pass the user’s exact words as userMessage.',
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
          // Do not dump full tool traces into orchestrator context (size)
        })
      },
    }),
  }
}
