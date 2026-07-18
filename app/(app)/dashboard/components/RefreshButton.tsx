'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
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
      // Bust Next Data Cache for price fetches, then re-render RSC tree
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
    <div className="flex flex-col items-center">
      <Button
        onClick={handleRefresh}
        disabled={isPending}
        variant="default"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Refreshing...
          </>
        ) : (
          'Refresh Prices'
        )}
      </Button>
      
      <div className="text-[10px] text-muted-foreground mt-1">
        Updated {relativeTime}
      </div>
    </div>
  )
}