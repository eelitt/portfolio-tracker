/**
 * Admin-only live eval suite runner.
 *
 * POST with no body, or { feature: "portfolio_analyst" }, runs the analyst suite.
 * { feature: "portfolio_orchestrator" } runs the routing suite.
 * Uses a long maxDuration so multi-case suites finish on Vercel; the admin UI
 * calls this instead of the shorter Server Action path.
 * A successful response is newline-delimited JSON: start, one case line per
 * fixture, then done. Auth failures stay a JSON error.
 */

import { createClient } from '@/lib/supabase/server'
import {
  runOrchestratorEvalSuite,
  runPortfolioAnalystEvalSuite,
} from '@/lib/agentEval/runSuite'
import { type EvalProgressEvent } from '@/lib/agentEval/progress'

/** Allow multi-minute sequential generateText calls. */
export const maxDuration = 300

async function readFeature(
  req: Request
): Promise<'portfolio_analyst' | 'portfolio_orchestrator' | Response> {
  const raw = await req.text()
  if (!raw.trim()) return 'portfolio_analyst'
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const feature =
    body && typeof body === 'object' && 'feature' in body
      ? (body as { feature?: unknown }).feature
      : undefined
  if (feature == null || feature === 'portfolio_analyst') return 'portfolio_analyst'
  if (feature === 'portfolio_orchestrator') return 'portfolio_orchestrator'
  return Response.json({ error: 'Unknown eval feature' }, { status: 400 })
}

export async function POST(req: Request) {
  try {
    const feature = await readFeature(req)
    if (feature instanceof Response) return feature

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

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: EvalProgressEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        }
        try {
          const result =
            feature === 'portfolio_orchestrator'
              ? await runOrchestratorEvalSuite(user.id, send)
              : await runPortfolioAnalystEvalSuite(user.id, send)
          if (result.error) {
            send({ type: 'error', error: result.error })
          } else if (result.data) {
            send({
              type: 'done',
              passed: result.data.passed,
              failed: result.data.failed,
              total: result.data.total,
              durationMs: result.data.durationMs,
            })
          } else {
            send({ type: 'error', error: 'Eval returned no result' })
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'unknown'
          console.error('agent-eval route error:', msg)
          send({ type: 'error', error: msg })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    console.error('agent-eval route error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
