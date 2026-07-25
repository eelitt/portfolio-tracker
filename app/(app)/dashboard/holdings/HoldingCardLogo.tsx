'use client'

/**
 * Brand-colored watermark logo for holding cards — top-left, diagonal fade.
 * Tries svg then png; hides silently if the file is missing.
 */

import { useState } from 'react'
import type { AssetType } from '@/lib/types'
import { getHoldingLogoCandidates } from './holdingLogo'
import { cn } from '@/lib/utils'

type Props = {
  symbol: string
  assetType: AssetType
  className?: string
}

export function HoldingCardLogo({ symbol, assetType, className }: Props) {
  const candidates = getHoldingLogoCandidates(symbol, assetType)
  const [index, setIndex] = useState(0)

  if (candidates.length === 0 || index >= candidates.length) {
    return null
  }

  const src = candidates[index]

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]',
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- public path + onError fallback chain */}
      <img
        src={src}
        alt=""
        draggable={false}
        onError={() => setIndex((i) => i + 1)}
        className={cn(
          'absolute left-2 top-2 h-24 w-24 object-contain object-left-top sm:h-28 sm:w-28',
          // Soft brand colors; text stays readable
          'opacity-[0.22]',
          // Stronger top-left → fade toward bottom-right
          '[mask-image:linear-gradient(to_bottom_right,black_0%,black_30%,transparent_78%)]',
          '[-webkit-mask-image:linear-gradient(to_bottom_right,black_0%,black_30%,transparent_78%)]'
        )}
      />
    </div>
  )
}
