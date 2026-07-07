'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'

export default function RefreshButton() {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  const [lastUpdatedTime, setLastUpdatedTime] = useState<Date>(new Date())

  // Update relative time every 30 seconds
  const [relativeTime, setRelativeTime] = useState(
    formatDistanceToNow(lastUpdatedTime, { addSuffix: true })
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setRelativeTime(formatDistanceToNow(lastUpdatedTime, { addSuffix: true }))
    }, 30000)

    return () => clearInterval(interval)
  }, [lastUpdatedTime])

  const handleRefresh = () => {
    setIsPending(true)
    
    router.refresh()
    
    setTimeout(() => {
      const now = new Date()
      setLastUpdatedTime(now)
      setRelativeTime(formatDistanceToNow(now, { addSuffix: true }))
      setIsPending(false)
      window.dispatchEvent(new CustomEvent('portfolio-updated'))
      toast.success('Prices refreshed')
    }, 600)
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