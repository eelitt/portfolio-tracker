'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2, Send, MessageSquare } from 'lucide-react'

const CAPABILITIES = [
  'Portfolio analysis (risks & concentration)',
  'Holding news for your positions',
  'Holdings, P&L, allocation, what-if',
  'Finnish capital-gains tax estimate',
  'Log a trade (draft → confirm; include €/$ + ticker)',
] as const

const SUGGESTED_PROMPTS = [
  'Analyze my portfolio — main risks and concentration',
  'Fetch news for my biggest holdings',
  'Estimate my Finnish capital-gains tax year-to-date',
  'Which positions are down more than 25% from my average cost?',
  'Log a buy: Bought 0.5 BTC at $64000 yesterday',
]

interface PortfolioAnalystViewProps {
  /** When omitted, header is chat-only (no back control). */
  onBack?: () => void
}

type AssistantToolHit = {
  toolName?: string
  toolCallId?: string
  state?: string
  result?: unknown
}

/** Walk useChat toolInvocations + parts for completed tool results. */
function forEachToolResult(
  message: {
    role: string
    toolInvocations?: AssistantToolHit[]
    parts?: Array<{
      type?: string
      toolInvocation?: AssistantToolHit
    }>
  },
  visit: (hit: {
    toolName: string | undefined
    toolCallId: string
    result: unknown
  }) => void
) {
  if (message.role !== 'assistant') return
  const seen = new Set<string>()

  const consider = (hit: AssistantToolHit | undefined) => {
    if (!hit || hit.state !== 'result' || !hit.toolCallId) return
    if (seen.has(hit.toolCallId)) return
    seen.add(hit.toolCallId)
    visit({
      toolName: hit.toolName,
      toolCallId: hit.toolCallId,
      result: hit.result,
    })
  }

  for (const inv of message.toolInvocations ?? []) consider(inv)
  for (const part of message.parts ?? []) {
    if (part.type !== 'tool-invocation') continue
    consider(part.toolInvocation)
  }
}

/**
 * Detect transaction saves from assistant tool results.
 * Orchestrator nests confirms under invoke_portfolio_analyst.transactionSaved.
 */
function getConfirmTransactionResults(message: {
  role: string
  toolInvocations?: AssistantToolHit[]
  parts?: Array<{
    type?: string
    toolInvocation?: AssistantToolHit
  }>
}): Array<{ toolCallId: string; result: unknown }> {
  const out: Array<{ toolCallId: string; result: unknown }> = []

  forEachToolResult(message, ({ toolName, toolCallId, result }) => {
    if (toolName === 'confirm_transaction') {
      out.push({ toolCallId, result })
      return
    }

    if (toolName === 'invoke_portfolio_analyst' && result && typeof result === 'object') {
      const r = result as {
        transactionSaved?: boolean
        transactionError?: string
      }
      if (r.transactionSaved === true) {
        out.push({ toolCallId, result: { ok: true } })
      } else if (typeof r.transactionError === 'string' && r.transactionError) {
        out.push({
          toolCallId,
          result: { ok: false, errors: [r.transactionError] },
        })
      }
    }
  })

  return out
}

/** News agent wrote a new package to storage — dashboard cards/popover should reload. */
function getHoldingNewsPackageUpdates(message: {
  role: string
  toolInvocations?: AssistantToolHit[]
  parts?: Array<{
    type?: string
    toolInvocation?: AssistantToolHit
  }>
}): Array<{ toolCallId: string }> {
  const out: Array<{ toolCallId: string }> = []

  forEachToolResult(message, ({ toolName, toolCallId, result }) => {
    if (toolName !== 'invoke_news_agent') return
    if (!result || typeof result !== 'object') return
    const r = result as { ok?: boolean; packageUpdated?: boolean }
    if (r.ok === true && r.packageUpdated === true) {
      out.push({ toolCallId })
    }
  })

  return out
}

function confirmErrorMessage(result: unknown): string {
  if (!result || typeof result !== 'object') {
    return 'Failed to add transaction'
  }
  const r = result as { errors?: unknown; error?: unknown }
  if (Array.isArray(r.errors) && r.errors.length > 0) {
    return String(r.errors[0])
  }
  if (typeof r.error === 'string' && r.error) return r.error
  return 'Failed to add transaction'
}

export function PortfolioAnalystView({ onBack }: PortfolioAnalystViewProps) {
  const showBack = typeof onBack === 'function'
  const router = useRouter()
  const processedConfirmIds = useRef(new Set<string>())
  const processedNewsPackageIds = useRef(new Set<string>())

  const {
    messages,
    input,
    handleSubmit,
    handleInputChange,
    status,
    error,
    setMessages,
    append,
  } = useChat({
    api: '/api/portfolio-analyst',
  })

  const isBusy = status === 'submitted' || status === 'streaming'

  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Toast + dashboard refresh when confirm_transaction finishes (same UX as modal)
  useEffect(() => {
    for (const message of messages) {
      for (const { toolCallId, result } of getConfirmTransactionResults(message)) {
        if (processedConfirmIds.current.has(toolCallId)) continue
        processedConfirmIds.current.add(toolCallId)

        const ok =
          result &&
          typeof result === 'object' &&
          (result as { ok?: boolean }).ok === true

        if (ok) {
          toast.success('Transaction added successfully')
          window.dispatchEvent(new CustomEvent('portfolio-updated'))
          router.refresh()
        } else {
          toast.error(confirmErrorMessage(result))
        }
      }
    }
  }, [messages, router])

  // Live news from chat → same storage as Holdings icon; refresh cards + popover
  useEffect(() => {
    for (const message of messages) {
      for (const { toolCallId } of getHoldingNewsPackageUpdates(message)) {
        if (processedNewsPackageIds.current.has(toolCallId)) continue
        processedNewsPackageIds.current.add(toolCallId)
        window.dispatchEvent(new CustomEvent('holding-news-updated'))
        router.refresh()
      }
    }
  }, [messages, router])

  // Clear chat when this view unmounts (back to menu or sidebar close)
  useEffect(() => {
    return () => {
      setMessages([])
    }
  }, [setMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isBusy])

  const onSuggested = (text: string) => {
    if (isBusy) return
    void append({ role: 'user', content: text })
  }

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex items-center gap-2 shrink-0">
        {showBack && (
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="h-8 px-3 flex items-center gap-1 transition-all hover:shadow-sm active:translate-y-px"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        )}
        <span className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          Chat
        </span>
      </div>

      {/* Fills panel under header; form stays at bottom */}
      <div
        ref={listRef}
        className="panel-scroll min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5"
      >
        {messages.length === 0 && (
          <div className="space-y-3 rounded-lg border border-subtle bg-card p-4 transition-colors duration-200 hover:border-gold">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Ask in plain language. I can run the same portfolio analysis and
                holding-news tools as the dashboard icons, plus tax, numbers, and
                trade logging.
              </p>
              <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground marker:text-gold/70">
                {CAPABILITIES.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="space-y-1 rounded-md border border-subtle/80 bg-background/60 px-2.5 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Rate limits
                </p>
                <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-muted-foreground marker:text-gold/60">
                  <li>
                    <span className="text-foreground/90">Portfolio analysis:</span>{' '}
                    about 1 minute between new runs. If your portfolio hasn&apos;t
                    changed, the latest analysis is reused.
                  </li>
                  <li>
                    <span className="text-foreground/90">Holding news:</span> one
                    full fetch per day (same as the Holdings icon).
                  </li>
                  <li>
                    <span className="text-foreground/90">Chat:</span> short gap
                    between messages; up to 30 messages per 15 minutes.
                  </li>
                </ul>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Try
              </p>
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onSuggested(prompt)}
                  disabled={isBusy}
                  className="w-full rounded-md border border-subtle bg-background px-3 py-2 text-left text-xs transition-colors hover:border-gold hover:bg-accent/60 disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === 'user'
                ? 'ml-4 bg-indigo-600/15 border border-indigo-500/30 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap'
                : 'mr-2 whitespace-pre-wrap rounded-lg border border-subtle bg-card px-3 py-2 text-sm'
            }
          >
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              {m.role === 'user' ? 'You' : 'Analyst'}
            </div>
            {m.content || (
              <span className="text-muted-foreground italic">
                {m.role === 'assistant' && isBusy ? 'Thinking…' : ''}
              </span>
            )}
          </div>
        ))}

        {isBusy && messages[messages.length - 1]?.role === 'user' && (
          <div className="mr-2 flex items-center gap-2 rounded-lg border border-subtle bg-card px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Analyzing with tools…
          </div>
        )}

        {error && (
          <div className="alert-error">
            {error.message || 'Something went wrong. Please try again.'}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="shrink-0 space-y-2">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (!isBusy && input.trim()) {
                  handleSubmit(e)
                }
              }
            }}
            placeholder="Ask about your portfolio…"
            rows={2}
            disabled={isBusy}
            className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <Button
            type="submit"
            size="icon"
            disabled={isBusy || !input.trim()}
            className="h-9 w-9 shrink-0"
            aria-label="Send message"
          >
            {isBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground leading-snug">
          Not financial advice. Answers use your transactions and available prices
          only. Chat is not saved when you leave this panel.
        </p>
      </form>
    </div>
  )
}
