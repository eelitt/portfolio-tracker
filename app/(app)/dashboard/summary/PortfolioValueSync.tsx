'use client'

/**
 * Publishes dashboard total market value so side panels (Goals) can reuse the
 * same mark generation without a second getPortfolioData / price fetch.
 */

import { useEffect } from 'react'
import type { PreferredCurrency } from '@/lib/userTypes'

export const PORTFOLIO_VALUE_EVENT = 'portfolio-value'

export type PortfolioValueDetail = {
  value: number
  currency: PreferredCurrency
}

type Props = {
  value: number
  currency: PreferredCurrency
}

export default function PortfolioValueSync({ value, currency }: Props) {
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent<PortfolioValueDetail>(PORTFOLIO_VALUE_EVENT, {
        detail: { value, currency },
      })
    )
  }, [value, currency])

  return null
}
