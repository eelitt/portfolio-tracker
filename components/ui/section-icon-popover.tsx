'use client'

/**
 * Lightweight accessible popover for section-title AI controls.
 * Click/keyboard to open; Escape + outside click to close.
 * Scrollbar uses panel-scroll (same theme as tax modal / side panels).
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type SectionIconPopoverProps = {
  /** Accessible name for the trigger */
  label: string
  /** Icon inside the trigger button */
  icon: ReactNode
  /** Subtle “has data” styling when true */
  hasData?: boolean
  /** Panel body */
  children: ReactNode
  /** Panel title shown in header */
  title: string
  /** Actions next to the title (e.g. Analyze / Refetch) */
  headerActions?: ReactNode
  /** Timing line under the title row (last used / next available) */
  headerMeta?: ReactNode
  className?: string
  panelClassName?: string
}

export function SectionIconPopover({
  label,
  icon,
  hasData = false,
  children,
  title,
  headerActions,
  headerMeta,
  className,
  panelClassName,
}: SectionIconPopoverProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open, close])

  return (
    <div ref={rootRef} className={cn('relative inline-flex', className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          'h-8 w-8 text-muted-foreground hover:text-foreground',
          hasData && 'text-gold hover:text-gold',
          open && 'bg-accent text-foreground'
        )}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
      </Button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={title}
          className={cn(
            'panel-scroll absolute left-0 top-full z-50 mt-2',
            'w-[min(28rem,calc(100vw-2rem))] sm:w-[min(32rem,calc(100vw-2rem))]',
            'max-h-[min(32rem,75vh)] overflow-y-auto',
            'rounded-xl border border-subtle bg-card p-4 shadow-xl',
            panelClassName
          )}
        >
          <div className="mb-3 space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex flex-1 flex-wrap items-center gap-x-3 gap-y-2">
                <div className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
                  {title}
                </div>
                {headerActions ? (
                  <div className="flex shrink-0 items-center pl-0.5 sm:pl-1">
                    {headerActions}
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Close"
                onClick={close}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {headerMeta ? (
              <div className="text-xs leading-snug text-muted-foreground">
                {headerMeta}
              </div>
            ) : null}
          </div>
          {children}
        </div>
      )}
    </div>
  )
}
