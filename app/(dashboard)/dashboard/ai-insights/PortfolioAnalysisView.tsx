'use client'

import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2 } from 'lucide-react'

interface PortfolioAnalysisViewProps {
  insights: string[] | null
  error: string | null
  cachedAt: string | null
  isLoading: boolean
  onBack: () => void
  onAnalyze: () => void
  formatRelativeTime: (isoString: string) => string
}

export function PortfolioAnalysisView({
  insights,
  error,
  cachedAt,
  isLoading,
  onBack,
  onAnalyze,
  formatRelativeTime,
}: PortfolioAnalysisViewProps) {
  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="h-8 px-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <span className="text-sm font-medium">Portfolio Analysis</span>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing your portfolio...
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded">
          {error}
        </div>
      )}

      {insights && (
        <div className="space-y-4">
          {cachedAt && (
            <div className="text-xs bg-blue-50 border border-blue-200 text-blue-700 p-2 rounded">
              Cached result from {formatRelativeTime(cachedAt)}. 
              You can request a fresh analysis after the cooldown.
            </div>
          )}

          <ul className="list-disc pl-5 space-y-1 text-sm leading-relaxed">
            {insights.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>

          <div className="text-xs text-muted-foreground bg-muted p-3 rounded border">
            <strong>Disclaimer:</strong> This is AI-generated analysis for informational purposes only. 
            It is not financial advice. Consult a qualified advisor.
          </div>

          <Button
            onClick={onAnalyze}
            disabled={isLoading}
            variant="secondary"
            className="w-full"
          >
            Re-analyze portfolio
          </Button>
        </div>
      )}

      {!isLoading && !error && !insights && (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground py-2">
            No analysis done yet.
          </div>
          <Button
            onClick={onAnalyze}
            disabled={isLoading}
            className="w-full"
          >
            Analyze portfolio
          </Button>
        </div>
      )}
    </div>
  )
}
