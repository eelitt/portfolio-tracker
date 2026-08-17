/**
 * Explicit chat-facing tool registry (MCP-flavored metadata).
 * Keep descriptions here; wire into AI SDK via toolDescription(id).
 */

import type { ToolMeta } from './types'

const analystReadFailures = [
  'not_authenticated',
  'portfolio_load_failed',
  'empty_portfolio',
] as const

export const TOOL_REGISTRY: Record<string, ToolMeta> = {
  // ── Portfolio Analyst (specialist) ─────────────────────────────
  get_portfolio_summary: {
    id: 'get_portfolio_summary',
    name: 'Portfolio summary',
    description:
      'Get high-level portfolio totals: market value, cost, unrealized P&L, 24h change, preferred currency, holding counts, and unpriced symbols.',
    owner: 'portfolio_analyst',
    sideEffect: 'read',
    requiresConfirmation: false,
    permissions: ['portfolio:read'],
    costTier: 'free',
    failureModes: [...analystReadFailures],
    rateLimitKey: null,
  },
  get_holdings: {
    id: 'get_holdings',
    name: 'Holdings list',
    description:
      'List open holdings with optional filters (asset type, symbol, unrealized P&L % thresholds). Use for questions like positions down more than X%.',
    owner: 'portfolio_analyst',
    sideEffect: 'read',
    requiresConfirmation: false,
    permissions: ['portfolio:read'],
    costTier: 'free',
    failureModes: [...analystReadFailures],
    rateLimitKey: null,
  },
  get_allocation: {
    id: 'get_allocation',
    name: 'Allocation',
    description:
      'Get portfolio allocation weights by symbol and by asset type (priced assets + cash only).',
    owner: 'portfolio_analyst',
    sideEffect: 'read',
    requiresConfirmation: false,
    permissions: ['portfolio:read'],
    costTier: 'free',
    failureModes: [...analystReadFailures],
    rateLimitKey: null,
  },
  get_relative_performance: {
    id: 'get_relative_performance',
    name: 'Relative performance',
    description:
      'Compare portfolio market-value path to SPY / URTH (MSCI World) / BTC over the Performance-chart window (daily 90d, monthly 24m, yearly). Returns window % , excess pp, daily tracking error, and ΔMV contribution by open holding (cash included). This is value-path vs price-path, not time-weighted alpha. Use for “did I beat the S&P / BTC?”. If snapshots are missing, say so — do not invent returns.',
    owner: 'portfolio_analyst',
    sideEffect: 'read',
    requiresConfirmation: false,
    permissions: ['portfolio:read'],
    costTier: 'free',
    failureModes: [...analystReadFailures, 'no_snapshot_history'],
    rateLimitKey: null,
  },
  get_target_allocation: {
    id: 'get_target_allocation',
    name: 'Target allocation',
    description:
      'Compare current weights to the user’s saved target mix (asset types + optional symbol overrides). Returns drift in percentage points and preferred-currency value. Use for “how far am I off target?”. Does not invent targets if none are saved.',
    owner: 'portfolio_analyst',
    sideEffect: 'read',
    requiresConfirmation: false,
    permissions: ['portfolio:read'],
    costTier: 'free',
    failureModes: [...analystReadFailures, 'no_target_policy'],
    rateLimitKey: null,
  },
  get_rebalance_plan: {
    id: 'get_rebalance_plan',
    name: 'Rebalance plan',
    description:
      'Deterministic trade suggestions to move toward the saved target. Modes: inplace (cash-first, sell only if needed) or new_cash (allocate an inflow to underweights; no sells). Not tax-aware. Suggestions are not logged trades.',
    owner: 'portfolio_analyst',
    sideEffect: 'read',
    requiresConfirmation: false,
    permissions: ['portfolio:read'],
    costTier: 'free',
    failureModes: [...analystReadFailures, 'no_target_policy'],
    rateLimitKey: null,
  },
  suggest_allocation_mix: {
    id: 'suggest_allocation_mix',
    name: 'Suggest allocation mix',
    description:
      'Return the deterministic type-weight template from the user’s Settings investor profile (risk + horizon required). Do not invent or replace the returned percentages. If fields are missing, tell the user to set them in Settings. Applying the mix is a sidebar action, not this tool.',
    owner: 'portfolio_analyst',
    sideEffect: 'read',
    requiresConfirmation: false,
    permissions: ['portfolio:read'],
    costTier: 'free',
    failureModes: ['profile_incomplete'],
    rateLimitKey: null,
  },
  get_realized_pnl: {
    id: 'get_realized_pnl',
    name: 'Realized P&L',
    description:
      'Compute realized P&L from sell/outflow transactions using weighted average cost. Optional filters: calendar year, asset type, symbol.',
    owner: 'portfolio_analyst',
    sideEffect: 'read',
    requiresConfirmation: false,
    permissions: ['portfolio:read'],
    costTier: 'free',
    failureModes: [...analystReadFailures],
    rateLimitKey: null,
  },
  get_transactions: {
    id: 'get_transactions',
    name: 'Transactions',
    description:
      'List recent transactions with optional filters. Hard limit 40. Use for grounding specific trade history questions.',
    owner: 'portfolio_analyst',
    sideEffect: 'read',
    requiresConfirmation: false,
    permissions: ['portfolio:read'],
    costTier: 'free',
    failureModes: [...analystReadFailures],
    rateLimitKey: null,
  },
  simulate_scenario: {
    id: 'simulate_scenario',
    name: 'What-if scenario',
    description:
      'Run a hypothetical what-if without writing any data. Types: sell_fraction (sell % or qty of a position at current price) or price_shock (mark selected symbols up/down by %).',
    owner: 'portfolio_analyst',
    sideEffect: 'read',
    requiresConfirmation: false,
    permissions: ['portfolio:read'],
    costTier: 'free',
    failureModes: [...analystReadFailures, 'invalid_scenario_args'],
    rateLimitKey: null,
  },
  prepare_transaction: {
    id: 'prepare_transaction',
    name: 'Prepare transaction draft',
    description:
      'Parse/validate a natural-language trade into a draft. Does NOT write to the database. ALWAYS call this when the user describes a buy/sell/deposit. On status=ready, stores a pending draft for confirm_transaction. Pass sourceText with the user’s words (must include € or $). European decimals: pass unit_price as 7.76 when they write 7,76.',
    owner: 'portfolio_analyst',
    sideEffect: 'staging',
    requiresConfirmation: false,
    permissions: ['portfolio:read', 'portfolio:write'],
    costTier: 'low',
    failureModes: [
      'validation_incomplete',
      'validation_invalid',
      'draft_store_failed',
    ],
    rateLimitKey: null,
  },
  confirm_transaction: {
    id: 'confirm_transaction',
    name: 'Confirm transaction',
    description:
      'Commit the pending draft ONLY after the user sends a dedicated confirm message (e.g. "confirm", "yes", "log it") in a NEW turn after prepare. Requires a server-stored pending draft. Do not call in the same turn as prepare_transaction.',
    owner: 'portfolio_analyst',
    sideEffect: 'write',
    requiresConfirmation: true,
    permissions: ['portfolio:write'],
    costTier: 'low',
    failureModes: [
      'same_turn_as_prepare',
      'no_explicit_confirm',
      'no_pending_draft',
      'validation_failed',
      'insert_failed',
    ],
    rateLimitKey: null,
  },
  list_watchlist: {
    id: 'list_watchlist',
    name: 'Watchlist',
    description:
      'List symbols on the user’s watchlist (ticker, asset type, added time). Use for “what am I watching?” questions. Not holdings.',
    owner: 'portfolio_analyst',
    sideEffect: 'read',
    requiresConfirmation: false,
    permissions: ['portfolio:read'],
    costTier: 'free',
    failureModes: ['not_authenticated', 'watchlist_load_failed'],
    rateLimitKey: null,
  },
  add_watchlist_item: {
    id: 'add_watchlist_item',
    name: 'Add to watchlist',
    description:
      'Add a catalog stock, ETF, or crypto to the watchlist. Pass query as the user’s symbol/name (e.g. "apple", "BNB"). Resolves against the catalog — never invent a ticker. Refuse symbols the user already holds (watchlist is not for open positions). No extra confirm turn. On ambiguity, ask the user. Not for logging trades.',
    owner: 'portfolio_analyst',
    sideEffect: 'write',
    requiresConfirmation: false,
    permissions: ['portfolio:write'],
    costTier: 'low',
    failureModes: [
      'catalog_unknown',
      'catalog_ambiguous',
      'validation_invalid',
      'watchlist_duplicate',
      'watchlist_held',
      'insert_failed',
    ],
    rateLimitKey: null,
  },
  remove_watchlist_item: {
    id: 'remove_watchlist_item',
    name: 'Remove from watchlist',
    description:
      'Remove a catalog symbol from the watchlist. Pass query as the user’s symbol/name. No extra confirm turn. Not for deleting transactions.',
    owner: 'portfolio_analyst',
    sideEffect: 'write',
    requiresConfirmation: false,
    permissions: ['portfolio:write'],
    costTier: 'low',
    failureModes: [
      'catalog_unknown',
      'catalog_ambiguous',
      'validation_invalid',
      'watchlist_not_found',
      'insert_failed',
    ],
    rateLimitKey: null,
  },

  // ── Orchestrator specialists ───────────────────────────────────
  invoke_news_agent: {
    id: 'invoke_news_agent',
    name: 'News agent',
    description:
      'Run the News Agent for holdings or watchlist news and impact (same providers as the dashboard news buttons; holdings and watchlist each have their own 24h cooldown). Returns `brief` plus per-symbol bullets/impact. Optional symbols (must be holdings unless universe=watchlist). Omit symbols for biggest holdings, or set universe=watchlist for the watchlist. Set forceRefresh true only when the user explicitly asks to fetch/refresh/update/get latest news. Prefer `brief`; if `statusNote` is present, include it briefly for the user.',
    owner: 'orchestrator',
    sideEffect: 'external',
    requiresConfirmation: false,
    permissions: ['ai:news'],
    costTier: 'high',
    failureModes: [
      'not_configured',
      'cooldown_store_hit',
      'provider_unavailable',
      'no_holdings',
    ],
    rateLimitKey: 'news_24h',
  },
  invoke_portfolio_analyst: {
    id: 'invoke_portfolio_analyst',
    name: 'Portfolio analyst agent',
    description:
      'Run the Portfolio Analyst specialist for holdings, P&L, allocation, target mix / drift / rebalance suggestions, mix-from-profile, scenarios, transaction logging, or watchlist list/add/remove. Not for tax math (use invoke_tax_agent). Pass newsContext only from News Agent output. For confirm/logging/watchlist, pass the user’s exact words as userMessage.',
    owner: 'orchestrator',
    sideEffect: 'read',
    requiresConfirmation: false,
    permissions: ['portfolio:read', 'portfolio:write'],
    costTier: 'medium',
    failureModes: ['specialist_error', 'write_blocked_in_child'],
    rateLimitKey: 'chat',
  },
  invoke_tax_agent: {
    id: 'invoke_tax_agent',
    name: 'Tax agent',
    description:
      'Finnish capital-gains tax estimate (luovutusvoitto): FIFO + weighted average vs hankintameno-olettama. Use for tax / CGT questions. Prefer the tool `brief`. Never invent tax figures. Modes: ytd (logged sells this year), hypothetical_sell (what-if), full (YTD + optional what-if). For “sell half of X” pass sellFraction 0.5 with symbol.',
    owner: 'orchestrator',
    sideEffect: 'read',
    requiresConfirmation: false,
    permissions: ['tax:estimate', 'portfolio:read'],
    costTier: 'low',
    failureModes: ['estimate_failed', 'missing_symbol_or_qty'],
    rateLimitKey: null,
  },
  invoke_portfolio_analysis_agent: {
    id: 'invoke_portfolio_analysis_agent',
    name: 'Portfolio analysis agent',
    description:
      'High-level portfolio analysis bullets (risks, concentration, structure). Same pipeline/limits as the Summary dashboard icon. Prefer `brief`; if `statusNote` is present, include it briefly. Not for exact P&L math (use portfolio analyst) or tax (use tax agent) or news (use news agent).',
    owner: 'orchestrator',
    sideEffect: 'storage',
    requiresConfirmation: false,
    permissions: ['ai:analysis', 'portfolio:read'],
    costTier: 'medium',
    failureModes: [
      'not_configured',
      'rate_limited',
      'hash_short_circuit',
      'empty_portfolio',
    ],
    rateLimitKey: 'ai_global_60s',
  },
}

/** Tool ids registered for portfolio analyst createPortfolioAnalystTools keys */
export const PORTFOLIO_ANALYST_TOOL_IDS = [
  'get_portfolio_summary',
  'get_holdings',
  'get_allocation',
  'get_relative_performance',
  'get_target_allocation',
  'get_rebalance_plan',
  'suggest_allocation_mix',
  'get_realized_pnl',
  'get_transactions',
  'simulate_scenario',
  'prepare_transaction',
  'confirm_transaction',
  'list_watchlist',
  'add_watchlist_item',
  'remove_watchlist_item',
] as const

/** Tool ids for createOrchestratorTools keys */
export const ORCHESTRATOR_TOOL_IDS = [
  'invoke_news_agent',
  'invoke_portfolio_analyst',
  'invoke_tax_agent',
  'invoke_portfolio_analysis_agent',
] as const

export function getTool(id: string): ToolMeta | undefined {
  return TOOL_REGISTRY[id]
}

export function toolDescription(id: string): string {
  const meta = TOOL_REGISTRY[id]
  if (!meta) {
    throw new Error(`aiTools registry: unknown tool id "${id}"`)
  }
  return meta.description
}

export function listTools(filter?: {
  owner?: ToolMeta['owner']
  sideEffect?: ToolMeta['sideEffect']
}): ToolMeta[] {
  return Object.values(TOOL_REGISTRY).filter((t) => {
    if (filter?.owner && t.owner !== filter.owner) return false
    if (filter?.sideEffect && t.sideEffect !== filter.sideEffect) return false
    return true
  })
}

const TRANSACTION_WRITE_IDS = new Set(['confirm_transaction'])

/** Dev/test: key===id; money writes require confirm; watchlist writes do not. */
export function assertRegistryInvariants(): void {
  for (const [key, meta] of Object.entries(TOOL_REGISTRY)) {
    if (key !== meta.id) {
      throw new Error(`Registry key "${key}" !== meta.id "${meta.id}"`)
    }
    if (meta.sideEffect !== 'write') continue
    if (TRANSACTION_WRITE_IDS.has(meta.id)) {
      if (!meta.requiresConfirmation) {
        throw new Error(
          `Tool "${meta.id}" is a transaction write but requiresConfirmation is false`
        )
      }
    } else if (meta.requiresConfirmation) {
      throw new Error(
        `Tool "${meta.id}" is a non-transaction write; must not require a confirm turn`
      )
    }
  }
}
