/**
 * Admin-only live eval suite runner.
 *
 * POST (no body) → run all portfolio_analyst fixtures against xAI.
 * Uses a long maxDuration so multi-case suites finish on Vercel; the admin UI
 * calls this instead of the shorter Server Action path.
 */

import { createClient } from '@/lib/supabase/server'
import { runPortfolioAnalystEvalSuite } from '@/lib/agentEval/runSuite'

/** Allow multi-minute sequential generateText calls. */
export const maxDuration = 300

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('admin')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.admin !== true) {
      return Response.json({ error: 'Admin access required' }, { status: 403 })
    }

    const result = await runPortfolioAnalystEvalSuite(user.id)
    if (result.error) {
      return Response.json({ error: result.error }, { status: 500 })
    }

    return Response.json({
      data: {
        evalRunId: result.data!.evalRunId,
        passed: result.data!.passed,
        failed: result.data!.failed,
        total: result.data!.total,
        durationMs: result.data!.durationMs,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    console.error('agent-eval route error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
