/**
 * Portfolio Analyst specialist agent (sub-call from orchestrator).
 *
 * Tool-first generateText over portfolio/tax/logging tools.
 * Does NOT fetch news — may only reference newsContext from the News Agent.
 */

import 'server-only'

import { generateText } from 'ai'
import { xai } from '@ai-sdk/xai'
import { createPortfolioAnalystTools } from './tools'
import {
  PORTFOLIO_ANALYST_SYSTEM_PROMPT,
  buildAnalystNewsContextBlock,
} from './prompt'
import {
  finishChildAgentRun,
  startChildAgentRun,
} from '@/lib/agents/runChildAgent'
import { toolRecordsFromStepResults } from '@/lib/agentObservability'
import type { AgentToolRecord } from '@/lib/agentObservability'
import type {
  ChildAgentContext,
  PortfolioAnalystAgentInput,
  PortfolioAnalystAgentOutput,
} from '@/lib/agents/types'

const FEATURE = 'portfolio_analyst'
const MODEL_ID = 'grok-4.3'

export async function runPortfolioAnalystAgent(
  ctx: ChildAgentContext,
  input: PortfolioAnalystAgentInput
): Promise<PortfolioAnalystAgentOutput> {
  const startedAt = Date.now()
  const runId = await startChildAgentRun({
    userId: ctx.userId,
    feature: FEATURE,
    agentRole: 'portfolio_analyst',
    parentRunId: ctx.parentRunId,
    model: MODEL_ID,
  })

  const collected: AgentToolRecord[] = []
  const lastUserText = input.lastUserText ?? input.userMessage

  let system = PORTFOLIO_ANALYST_SYSTEM_PROMPT
  const newsBlock = buildAnalystNewsContextBlock(input.newsContext)
  if (newsBlock) {
    system = `${system}\n\n${newsBlock}`
  }

  // Task-oriented wrapper so the specialist stays focused
  const taskHint =
    input.task === 'position_snapshot'
      ? 'Task: return position size, cost, market value, unrealized P&L, and allocation weight for the relevant symbols using tools. Be concise.'
      : input.task === 'prepare_trade'
        ? 'Task: handle transaction logging (prepare/confirm) per tool rules.'
        : 'Task: answer the user using tools. Be concise.'

  const symbolHint = input.symbols?.length
    ? `Focus symbols: ${input.symbols.map((s) => s.toUpperCase()).join(', ')}.`
    : ''

  const userContent = [taskHint, symbolHint, input.userMessage]
    .filter(Boolean)
    .join('\n')

  try {
    if (!process.env.XAI_API_KEY) {
      const err = 'AI service is not configured.'
      await finishChildAgentRun({
        runId,
        status: 'error',
        tools: collected,
        model: MODEL_ID,
        durationMs: Date.now() - startedAt,
        errorSummary: err,
        parentRunId: ctx.parentRunId,
        agentRole: 'portfolio_analyst',
      })
      return { ok: false, toolTrace: collected, error: err }
    }

    const result = await generateText({
      model: xai(MODEL_ID),
      system,
      messages: [{ role: 'user', content: userContent }],
      tools: createPortfolioAnalystTools(ctx.userId, {
        lastUserText,
        dryRun: input.dryRun === true,
      }),
      maxSteps: 5,
      temperature: 0.2,
      onStepFinish: (step) => {
        collected.push(
          ...toolRecordsFromStepResults(
            (step.toolResults || []).map((tr) => ({
              toolName: tr.toolName,
              args: tr.args,
              result: tr.result,
            }))
          )
        )
      },
    })

    if (collected.length === 0 && result.steps) {
      for (const step of result.steps) {
        collected.push(
          ...toolRecordsFromStepResults(
            (step.toolResults || []).map((tr) => ({
              toolName: tr.toolName,
              args: tr.args,
              result: tr.result,
            }))
          )
        )
      }
    }

    await finishChildAgentRun({
      runId,
      status: 'success',
      tools: collected,
      usage: result.usage
        ? {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
          }
        : null,
      model: MODEL_ID,
      durationMs: Date.now() - startedAt,
      stepCount: result.steps?.length ?? collected.length,
      parentRunId: ctx.parentRunId,
      agentRole: 'portfolio_analyst',
    })

    // Surface confirm outcomes for the orchestrator + client toast bridge
    const confirmTool = [...collected]
      .reverse()
      .find((t) => t.name === 'confirm_transaction')
    const transactionSaved = confirmTool?.ok === true
    const transactionError =
      confirmTool && !confirmTool.ok
        ? confirmTool.error || 'Transaction was not saved'
        : undefined
    const watchlistChanged = collected.some((t) => {
      if (
        t.name !== 'add_watchlist_item' &&
        t.name !== 'remove_watchlist_item'
      ) {
        return false
      }
      if (t.ok !== true) return false
      const result = t.result
      if (result && typeof result === 'object' && 'dryRun' in result) {
        return (result as { dryRun?: boolean }).dryRun !== true
      }
      return true
    })

    return {
      ok: true,
      text: result.text?.trim() || undefined,
      toolTrace: collected,
      transactionSaved: transactionSaved || undefined,
      transactionError,
      watchlistChanged: watchlistChanged || undefined,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Portfolio analyst agent failed'
    await finishChildAgentRun({
      runId,
      status: 'error',
      tools: collected,
      model: MODEL_ID,
      durationMs: Date.now() - startedAt,
      errorSummary: msg,
      parentRunId: ctx.parentRunId,
      agentRole: 'portfolio_analyst',
    })
    return { ok: false, toolTrace: collected, error: msg }
  }
}
