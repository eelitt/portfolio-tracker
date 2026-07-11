'use client'

import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2 } from 'lucide-react'

interface PortfolioAnalysisViewProps {
  insights: string[] | null
  error: string | null
  cachedAt: string | null
  isLoading: boolean
  lastAnalysisMessage?: string | null
  onBack: () => void
  onAnalyze: () => void
  formatRelativeTime: (isoString: string) => string
}

export function PortfolioAnalysisView({
  insights,
  error,
  cachedAt,
  isLoading,
  lastAnalysisMessage,
  onBack,
  onAnalyze,
  formatRelativeTime,
}: PortfolioAnalysisViewProps) {
  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          className="h-8 px-3 flex items-center gap-1 transition-all hover:shadow-sm active:translate-y-px"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <span className="text-sm font-medium">Portfolio Analysis</span>
      </div>

      {isLoading && !insights && (
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading previous analysis...
          </div>
        </div>
      )}

      {error && (
        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded">
            {error}
          </div>
        </div>
      )}

      {insights && (
        <div className="bg-card border rounded-lg p-4 space-y-4">
          {isLoading && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating fresh analysis with AI...
            </div>
          )}

          {lastAnalysisMessage && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 p-3 rounded text-sm">
              <span>
                {lastAnalysisMessage === 'Showing previous analysis (portfolio unchanged)'
                  ? 'No new analysis was generated — your portfolio data hasn\'t changed since the last analysis.'
                  : lastAnalysisMessage}
              </span>
            </div>
          )}

          {cachedAt && !lastAnalysisMessage && (
            <div className="text-xs bg-blue-50 border border-blue-200 text-blue-700 p-2 rounded">
              Cached result from {formatRelativeTime(cachedAt)}. 
              You can request a fresh analysis after the cooldown.
            </div>
          )}

          {/* Bullet points in their own differentiated container */}
          <div className={`bg-background border rounded-lg p-4 ${isLoading ? 'opacity-60' : ''}`}>
            <span className="text-sm font-medium">Analysis</span>
            <ul className="list-disc pt-2 pl-5 space-y-1 text-sm leading-relaxed">
              {insights.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </div>

          <div className="text-xs text-muted-foreground bg-muted p-3 rounded border">
            <strong>Disclaimer:</strong> This is AI-generated analysis for informational purposes only. 
            It is not financial advice. Consult a qualified advisor.
          </div>

          <Button
            onClick={onAnalyze}
            disabled={isLoading}
            variant="default"
            className="w-full py-2.5 text-md font-medium transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.985]"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Generating...
              </>
            ) : (
              'Re-analyze portfolio'
            )}
          </Button>
        </div>
      )}

      {!isLoading && !error && !insights && (
        <div className="bg-card border rounded-lg p-4 space-y-4">
          <div className="text-sm text-muted-foreground py-2">
            No analysis done yet.
          </div>
          <Button
            onClick={onAnalyze}
            disabled={isLoading}
            className="w-full py-2.5 text-sm font-medium transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.985]"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Analyzing...
              </>
            ) : (
              'Analyze portfolio'
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
