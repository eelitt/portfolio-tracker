'use client'

import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

interface PlaceholderViewProps {
  title: string
  onBack: () => void
}

export function PlaceholderView({ title, onBack }: PlaceholderViewProps) {
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
        <span className="text-sm font-medium">{title}</span>
      </div>

      <div className="py-8 text-center">
        <div className="text-sm text-muted-foreground mb-2">
          This feature is coming soon.
        </div>
        <p className="text-xs text-muted-foreground">
          We're working on more helpful AI tools for your portfolio.
        </p>
      </div>
    </div>
  )
}
