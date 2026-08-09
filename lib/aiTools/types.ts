/**
 * MCP-flavored tool metadata (in-process).
 * Registry is the contract; execute bodies stay next to features.
 */

export type ToolOwner =
  | 'orchestrator'
  | 'portfolio_analyst'
  | 'news'
  | 'tax'
  | 'analysis'

/** What the tool does to systems / data. */
export type ToolSideEffect =
  | 'none'
  | 'read'
  | 'staging'
  | 'write'
  | 'external'
  | 'storage'

export type ToolPermission =
  | 'portfolio:read'
  | 'portfolio:write'
  | 'ai:news'
  | 'ai:analysis'
  | 'tax:estimate'

export type ToolCostTier = 'free' | 'low' | 'medium' | 'high'

export type ToolRateLimitKey = 'chat' | 'ai_global_60s' | 'news_24h'

export type ToolMeta = {
  /** Stable id — must match AI SDK tool object key */
  id: string
  /** Short human label */
  name: string
  /** Model-facing description (single source for tool()) */
  description: string
  owner: ToolOwner
  sideEffect: ToolSideEffect
  /**
   * Portfolio mutation requires an explicit user confirm turn.
   * Must be true when sideEffect === 'write'.
   */
  requiresConfirmation: boolean
  permissions: ToolPermission[]
  costTier: ToolCostTier
  /** Stable failure mode labels (Phase 19 hooks); not user-facing copy */
  failureModes: string[]
  rateLimitKey?: ToolRateLimitKey | null
}

export type UserContextPack = {
  preferredCurrency: 'USD' | 'EUR'
  isAdmin: boolean
  goals: Array<{
    name: string
    targetAmount: number
    isCompleted: boolean
  }>
  lastAnalysis: {
    bullets: string[]
    asOf: string | null
  } | null
  lastNews: {
    asOf: string | null
    symbolCount: number
  } | null
  portfolioOneLiner: string | null
}
