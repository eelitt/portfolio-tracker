'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2, Send, MessageSquare } from 'lucide-react'

const SUGGESTED_PROMPTS = [
  'Which positions are down more than 25% from my average cost?',
  'What is my total realized P&L this year on crypto only?',
  'What if I sell 40% of my largest holding at the current price?',
  'Simulate a 50% drawdown in my top 3 holdings.',
  'Log a buy: Bought 0.5 BTC at $64000 yesterday',
]

interface PortfolioAnalystViewProps {
  onBack: () => void
}

/** Pull completed confirm_transaction tool results from an assistant message. */
function getConfirmTransactionResults(message: {
  role: string
  toolInvocations?: Array<{
    toolName?: string
    toolCallId?: string
    state?: string
    result?: unknown
  }>
  parts?: Array<{
    type?: string
    toolInvocation?: {
      toolName?: string
      toolCallId?: string
      state?: string
      result?: unknown
    }
  }>
}): Array<{ toolCallId: string; result: unknown }> {
  const out: Array<{ toolCallId: string; result: unknown }> = []

  if (message.role !== 'assistant') return out

  const fromInvocations = message.toolInvocations ?? []
  for (const inv of fromInvocations) {
    if (
      inv.toolName === 'confirm_transaction' &&
      inv.state === 'result' &&
      inv.toolCallId
    ) {
      out.push({ toolCallId: inv.toolCallId, result: inv.result })
    }
  }

  for (const part of message.parts ?? []) {
    if (part.type !== 'tool-invocation' || !part.toolInvocation) continue
    const inv = part.toolInvocation
    if (
      inv.toolName === 'confirm_transaction' &&
      inv.state === 'result' &&
      inv.toolCallId
    ) {
      // Avoid duplicates if both parts and toolInvocations are present
      if (!out.some((x) => x.toolCallId === inv.toolCallId)) {
        out.push({ toolCallId: inv.toolCallId, result: inv.result })
      }
    }
  }

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
  const router = useRouter()
  const processedConfirmIds = useRef(new Set<string>())

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
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          className="h-8 px-3 flex items-center gap-1 transition-all hover:shadow-sm active:translate-y-px"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <span className="text-sm font-medium flex items-center gap-1.5">
          <MessageSquare className="h-4 w-4" />
          Portfolio Analyst
        </span>
      </div>

      {/* Capped height so the prompt form sits higher (not pinned to viewport bottom) */}
      <div
        ref={listRef}
        className="max-h-[min(42vh,340px)] overflow-y-auto space-y-3 pr-1"
      >
        {messages.length === 0 && (
          <div className="bg-card border rounded-lg p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              I only answer from your portfolio data — holdings, cost basis, P&L,
              allocation, what-if scenarios, and logging a trade you dictate
              (draft → confirm; include €/$ and a ticker).
            </p>
            <div className="space-y-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onSuggested(prompt)}
                  disabled={isBusy}
                  className="w-full text-left text-xs border rounded-md px-3 py-2 bg-background hover:bg-accent/60 transition-colors disabled:opacity-50"
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
                : 'mr-2 bg-card border rounded-lg px-3 py-2 text-sm whitespace-pre-wrap'
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
          <div className="mr-2 bg-card border rounded-lg px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Analyzing with tools…
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 rounded">
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
