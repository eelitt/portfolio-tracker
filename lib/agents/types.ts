/**
 * Multi-agent contracts: orchestrator invokes specialists with structured I/O.
 * Extensible: add agent ids + runners without changing the chat surface.
 */

import type { AgentToolRecord } from '@/lib/agentObservability'

export type AgentId =
  | 'news'
  | 'portfolio_analyst'
  | 'tax'
  | 'portfolio_analysis'
  | (string & {})

export type AgentRole =
  | 'orchestrator'
  | 'news'
  | 'portfolio_analyst'
  | 'tax'
  | 'portfolio_analysis'
  | (string & {})

/** News Agent — research only; never portfolio math. */
export type NewsAgentInput = {
  symbols?: string[]
  /** holdings (default) or watchlist — same 24h news cooldown either way */
  universe?: 'holdings' | 'watchlist'
  forceRefresh?: boolean
  questionHint?: string
  /** No live fetch / no package write */
  dryRun?: boolean
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
  /**
   * Calm user-facing status when useful (e.g. explicit refresh not available yet).
   * Orchestrator may show this; omit cache jargon.
   */
  statusNote?: string
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
  /** Prepare/confirm without persistence */
  dryRun?: boolean
}

export type PortfolioAnalystAgentOutput = {
  ok: boolean
  text?: string
  toolTrace: AgentToolRecord[]
  error?: string
  /** Set when confirm_transaction succeeded in this specialist run. */
  transactionSaved?: boolean
  transactionError?: string
  /** Set when add/remove watchlist succeeded in this specialist run. */
  watchlistChanged?: boolean
}

/** Tax Agent — Finnish CGT estimates only; never invents tax figures. */
export type TaxAgentInput = {
  mode: 'hypothetical_sell' | 'ytd' | 'full'
  taxYear?: number
  symbol?: string
  quantity?: number
  /** 0–1 fraction of open holding when quantity omitted (e.g. 0.5 = half). */
  sellFraction?: number
  unitPrice?: number
  unitPriceCurrency?: 'USD' | 'EUR'
  otherCapitalIncomeEur?: number
  sellingCostsEur?: number
  questionHint?: string
}

export type TaxAgentSummary = {
  taxYear: number
  mode: string
  ratesYearLabel: string
  otherCapitalIncomeEur: number
  fifo: {
    estimatedTaxEur: number
    taxableBaseEur: number
    netGainOrLossEur: number
    usedHmo: boolean
  }
  weightedAverage: {
    estimatedTaxEur: number
    taxableBaseEur: number
    netGainOrLossEur: number
    usedHmo: boolean
  }
  comparison: { lowerTaxMethod: string; taxDeltaEur: number }
  disposalCount: number
}

export type TaxAgentOutput = {
  ok: boolean
  error?: string
  brief?: string
  summary?: TaxAgentSummary
  toolTrace?: AgentToolRecord[]
}

/** Portfolio Analysis Agent — narrative bullets over portfolio snapshot (not holdings math). */
export type PortfolioAnalysisAgentInput = {
  /** Force a new LLM pass even if hash matches — not exposed by default. */
  force?: boolean
  /** Preview only: return stored insights; never call LLM / write. */
  dryRun?: boolean
}

export type PortfolioAnalysisAgentOutput = {
  ok: boolean
  error?: string
  insights?: string[]
  brief?: string
  asOf?: string
  /** Calm status from generatePortfolioInsights (unchanged portfolio, rate limit, …). */
  statusNote?: string
  /** True when storage was written (for Summary popover sync). */
  packageUpdated?: boolean
  failureMode?: string
  recovery?: string
  dryRun?: boolean
  toolTrace?: AgentToolRecord[]
}

export type ChildAgentContext = {
  userId: string
  parentRunId: string | null
}
