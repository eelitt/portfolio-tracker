'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Dashboard error boundary caught:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
      <div className="max-w-md">
        <h2 className="text-2xl font-semibold mb-3">Something went wrong</h2>
        <p className="text-gray-600 mb-6">
          We couldn&apos;t load your portfolio data right now. This is usually temporary.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset} variant="default">
            Try again
          </Button>
          <Button 
            onClick={() => window.location.reload()} 
            variant="outline"
          >
            Reload page
          </Button>
        </div>
      </div>
    </div>
  )
}