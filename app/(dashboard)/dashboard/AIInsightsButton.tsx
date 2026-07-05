'use client'

import { useState, useTransition } from 'react'
import { generateAIInsights } from '@/app/actions/generateAIInsights'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function AIInsightsButton() {
  const [isPending, startTransition] = useTransition()
  const [insights, setInsights] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleClick = () => {
    startTransition(async () => {
      const result = await generateAIInsights()
      if ('error' in result && result.error) {
        toast.error(result.error)
        setError(result.error)
        setInsights(null)
        setDialogOpen(true)
      } else if ('insights' in result && result.insights) {
        setError(null)
        setInsights(result.insights)
        setDialogOpen(true)
      }
    })
  }

  const closeDialog = () => {
    setDialogOpen(false)
    // keep insights in case user wants to reopen, or clear:
    // setInsights(null)
  }

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={isPending}
        variant="default"
        className="flex items-center gap-2"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Get AI Insights
          </>
        )}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent 
          className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>AI Portfolio Insights</DialogTitle>
          </DialogHeader>

          {error ? (
            <div className="text-sm text-red-600">
              {error}
            </div>
          ) : insights ? (
            <div className="space-y-4">
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {insights}
              </div>

              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <strong>Disclaimer:</strong> This AI-generated analysis is for
                informational and educational purposes only. It is not financial
                advice, a recommendation, or an endorsement of any investment
                strategy. Past performance is not indicative of future results.
                The data is a snapshot and may be stale. Please consult a
                licensed financial advisor before making any investment
                decisions.
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Unable to generate insights.
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={closeDialog}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
