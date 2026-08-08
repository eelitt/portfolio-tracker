/**
 * Multi-agent contracts: orchestrator invokes specialists with structured I/O.
 * Extensible: add agent ids + runners without changing the chat surface.
 */

import type { AgentToolRecord } from '@/lib/agentObservability'

export type AgentId = 'news' | 'portfolio_analyst' | (string & {})

export type AgentRole =
  | 'orchestrator'
  | 'news'
  | 'portfolio_analyst'
  | (string & {})

/** News Agent — research only; never portfolio math. */
export type NewsAgentInput = {
  symbols?: string[]
  forceRefresh?: boolean
  questionHint?: string
}

export type NewsHoldingResult = {
  symbol: string
  assetType?: string
  bullets: string[]
  impact?: {
    tone: string
    outlook: string
    points?: string[]
  }
}

export type NewsAgentOutput = {
  ok: boolean
  fromCache: boolean
  updatedCache: boolean
  nextRefreshAt?: string
  windowFrom?: string
  windowTo?: string
  holdings: NewsHoldingResult[]
  /**
   * Deterministic user-facing summary for the orchestrator to present.
   * Prefer this over narrating internal cache flags.
   */
  brief?: string
  /** Optional ISO timestamp for "as of" (not a cache lecture). */
  asOf?: string
  message?: string
  error?: string
  /** Synthetic tool steps for observability */
  toolTrace?: AgentToolRecord[]
}

/** Portfolio Analyst specialist — numbers, scenarios, logging; no news fetch. */
export type PortfolioAnalystTask =
  | 'answer'
  | 'position_snapshot'
  | 'prepare_trade'

export type PortfolioAnalystAgentInput = {
  task?: PortfolioAnalystTask
  userMessage: string
  symbols?: string[]
  /** Structured news from News Agent only — never free-form invented headlines. */
  newsContext?: NewsAgentOutput
  lastUserText?: string
}

export type PortfolioAnalystAgentOutput = {
  ok: boolean
  text?: string
  toolTrace: AgentToolRecord[]
  error?: string
  /** Set when confirm_transaction succeeded in this specialist run. */
  transactionSaved?: boolean
  transactionError?: string
}

export type ChildAgentContext = {
  userId: string
  parentRunId: string | null
}
