import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/actions/ai/portfolio-analyst/agent', () => ({
  runPortfolioAnalystAgent: vi.fn(),
}))
vi.mock('@/app/actions/ai/holding-news/agent', () => ({
  runNewsAgent: vi.fn(),
}))
vi.mock('@/app/actions/ai/tax/agent', () => ({
  runTaxAgent: vi.fn(),
}))
vi.mock('@/app/actions/ai/portfolio-insights/agent', () => ({
  runPortfolioAnalysisAgent: vi.fn(),
}))

import { runPortfolioAnalystAgent } from '@/app/actions/ai/portfolio-analyst/agent'
import { createOrchestratorTools } from '@/app/actions/ai/orchestrator/tools'

const execution = { toolCallId: 'call-1', messages: [] }

describe('orchestrator model payload', () => {
  beforeEach(() => {
    vi.mocked(runPortfolioAnalystAgent).mockReset()
  })

  it('returns analyst text longer than the stored-run cap', async () => {
    const text = 'a'.repeat(600)
    vi.mocked(runPortfolioAnalystAgent).mockResolvedValue({
      ok: true,
      text,
      toolTrace: [],
    })

    const tools = createOrchestratorTools({
      userId: 'user-1',
      parentRunId: null,
      lastUserText: 'How much do I have?',
    })
    const execute = tools.invoke_portfolio_analyst.execute
    expect(execute).toBeTypeOf('function')

    const result = await execute!({ userMessage: 'How much do I have?' }, execution)
    expect(result).toMatchObject({ ok: true, text })
    expect((result as { text?: string }).text).toHaveLength(600)
  })
})
