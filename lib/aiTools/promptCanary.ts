/**
 * Private token that belongs only in the orchestrator and analyst system prompts.
 * A reply that contains it is treated as a prompt leak on the agent_runs row.
 */

export const PROMPT_POLICY_CANARY = 'portc-7f3a-anchor'

export function textHasPromptCanary(text: string): boolean {
  return text.includes(PROMPT_POLICY_CANARY)
}
