'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

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
      toast.success('Prices refreshed')
    }, 600)
  }

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={handleRefresh}
        disabled={isPending}
        className="flex items-center justify-center gap-2 px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-70 transition-colors"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Refreshing...
          </>
        ) : (
          'Refresh Prices'
        )}
      </button>
      
      <div className="text-[10px] text-gray-500 mt-1">
        Updated {relativeTime}
      </div>
    </div>
  )
}