/**
 * In-process MCP-flavored tool layer (client-safe barrel).
 * Server-only context: import `@/lib/aiTools/buildUserContext` directly.
 */

export type {
  ToolMeta,
  ToolOwner,
  ToolSideEffect,
  ToolPermission,
  ToolCostTier,
  ToolRateLimitKey,
  UserContextPack,
} from './types'

export {
  TOOL_REGISTRY,
  PORTFOLIO_ANALYST_TOOL_IDS,
  ORCHESTRATOR_TOOL_IDS,
  getTool,
  toolDescription,
  listTools,
  assertRegistryInvariants,
} from './registry'

export { assertWriteAllowed } from './enforce'
export type { WriteGateInput, WriteGateResult } from './enforce'
