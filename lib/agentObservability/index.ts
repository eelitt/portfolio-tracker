/**
 * Public barrel for agent observability (pure helpers + types).
 * Persistence lives in recordRun.ts (server-only) — import that path directly
 * from API routes so client bundles never pull the service client.
 */

export { AGENT_RUN_SCHEMA_VERSION } from './types'
export type {
  AgentFeature,
  AgentRunMeta,
  AgentRunRow,
  AgentRunStatus,
  AgentToolRecord,
  EvalCaseFixture,
  EvalExpect,
  ScoreCheck,
  ScoreResult,
  TokenUsage,
} from './types'
export { redactForStorage, asArgsRecord, toolResultOk } from './redact'
export { estimateCostUsd } from './cost'
export {
  scoreCase,
  deriveConfirmMeta,
  toolRecordsFromStepResults,
} from './score'
