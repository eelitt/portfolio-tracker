'use client'

/**
 * Secondary utility: revalidate price cache + refresh dashboard RSC tree.
 * Styled as outline/sm so it does not compete with "Add transaction".
 */

import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { refreshPortfolioPrices } from '@/app/actions/prices'

export default function RefreshButton() {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  const [lastUpdatedTime, setLastUpdatedTime] = useState<Date | null>(null)
  const [relativeTime, setRelativeTime] = useState<string>('just now')

  // Set initial client-side time after hydration to avoid mismatch
  useEffect(() => {
    const now = new Date()
    setLastUpdatedTime(now)
    setRelativeTime(formatDistanceToNow(now, { addSuffix: true }))
  }, [])

  // Update relative time every 30 seconds
  useEffect(() => {
    if (!lastUpdatedTime) return

    const interval = setInterval(() => {
      setRelativeTime(formatDistanceToNow(lastUpdatedTime, { addSuffix: true }))
    }, 30000)

    return () => clearInterval(interval)
  }, [lastUpdatedTime])

  const handleRefresh = async () => {
    setIsPending(true)
    try {
      await refreshPortfolioPrices()
      router.refresh()
      const now = new Date()
      setLastUpdatedTime(now)
      setRelativeTime(formatDistanceToNow(now, { addSuffix: true }))
      window.dispatchEvent(new CustomEvent('portfolio-updated'))
      toast.success('Prices refreshed')
    } catch {
      toast.error('Could not refresh prices. Try again.')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-muted-foreground sm:inline">
        Updated {relativeTime}
      </span>
      <Button
        type="button"
        onClick={handleRefresh}
        disabled={isPending}
        variant="outline"
        size="sm"
        aria-label="Refresh prices"
        className="gap-1.5"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        <span className="hidden sm:inline">
          {isPending ? 'Refreshing…' : 'Refresh'}
        </span>
      </Button>
    </div>
  )
}
