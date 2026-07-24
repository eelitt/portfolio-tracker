'use client'

/**
 * Compact mutually exclusive control (view tabs / range chips).
 * Reads as a switcher, not primary action buttons.
 */

import { cn } from '@/lib/utils'

export type SegmentOption<T extends string> = {
  value: T
  label: string
}

type SegmentedControlProps<T extends string> = {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'default' | 'sm'
  disabled?: boolean
  'aria-label'?: string
  className?: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'default',
  disabled = false,
  'aria-label': ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex max-w-full flex-wrap rounded-lg bg-muted p-1',
        size === 'sm' ? 'text-xs' : 'text-sm',
        className
      )}
    >
      {options.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
              size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
