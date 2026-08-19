'use client'

import { useEffect, useRef, useState } from 'react'
import { FIXED_TYPE_RATES, STABLE_RATE } from '@/lib/projections'

function pct(rate: number, digits = 0) {
  return `${(rate * 100).toFixed(digits)}%`
}

export function GoalReturnDisclaimer() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const open = hover || pinned

  const clearClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  useEffect(() => () => clearClose(), [])

  useEffect(() => {
    if (!pinned) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(false)
    }
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPinned(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [pinned])

  return (
    <div
      ref={rootRef}
      className="relative min-w-0"
      onMouseEnter={() => {
        clearClose()
        setHover(true)
      }}
      onMouseLeave={() => {
        if (pinned) return
        clearClose()
        closeTimer.current = setTimeout(() => setHover(false), 160)
      }}
    >
      <button
        type="button"
        className="max-w-full text-left text-[10px] leading-snug text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
        aria-expanded={open}
        onClick={() => setPinned((v) => !v)}
      >
        Disclaimer — not financial advice
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-1 w-[min(17.5rem,calc(100vw-2rem))] rounded-lg border border-subtle bg-card p-3 text-[11px] leading-relaxed text-muted-foreground shadow-xl"
        >
          <p className="font-medium text-foreground">
            How assumed return is built
          </p>
          <p className="mt-1.5">
            Each goal’s tooltip shows that goal’s blended rate. Not a forecast and not
            advice. Crypto-heavy books can look very high because historic
            prints were large. They may not repeat.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              Stock/ETF {pct(FIXED_TYPE_RATES.stock)}, cash{' '}
              {pct(FIXED_TYPE_RATES.cash)}, stables {pct(STABLE_RATE)}.
            </li>
            <li>
              Each other crypto: Yahoo long-window CAGR − 2pp if history is at
              least 5 years; otherwise BTC’s rate or 6%.
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}
