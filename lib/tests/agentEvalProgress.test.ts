import { describe, expect, it } from 'vitest'
import { parseEvalProgressLine } from '@/lib/agentEval/progress'

describe('parseEvalProgressLine', () => {
  it('parses a case line', () => {
    expect(
      parseEvalProgressLine(
        '{"type":"case","index":2,"total":8,"caseId":"route-news-001","passed":true}'
      )
    ).toEqual({
      type: 'case',
      index: 2,
      total: 8,
      caseId: 'route-news-001',
      passed: true,
    })
  })

  it('ignores a blank line', () => {
    expect(parseEvalProgressLine('  ')).toBeNull()
  })

  it('ignores a non-JSON line', () => {
    expect(parseEvalProgressLine('not json')).toBeNull()
  })
})
