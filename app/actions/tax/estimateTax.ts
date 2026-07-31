'use server'

/**
 * Server boundary for Finnish tax estimator.
 * Loads user transactions, normalizes to EUR via adapter, runs pure estimate.
 * No tax math beyond calling lib/tax.
 */

import { z } from 'zod'
import { getUserTransactions } from '@/app/actions/transactions'
import { getCurrentUser } from '@/lib/user'
import { getUsdToEurRate, convertBetweenCurrencies } from '@/lib/currency'
import {
  appTransactionsToTaxableEvents,
  estimateFinnishCapitalGains,
  type EstimateMode,
  type FinnishTaxEstimateResult,
  type TaxAssetClass,
} from '@/lib/tax'
import type { Transaction } from '@/lib/types'

const estimateTaxInputSchema = z.object({
  mode: z.enum(['hypothetical_sell', 'ytd', 'full']),
  taxYear: z.number().int().min(2000).max(2100).optional(),
  otherCapitalIncomeEur: z.number().min(0).optional(),
  /** Required for hypothetical_sell; optional for full */
  symbol: z.string().min(1).optional(),
  quantity: z.number().positive().optional(),
  /**
   * Unit price in the currency given by unitPriceCurrency (default EUR).
   * If omitted for hypothetical, caller should pass a mark from prices.
   */
  unitPrice: z.number().min(0).optional(),
  unitPriceCurrency: z.enum(['USD', 'EUR']).optional(),
  sellingCostsEur: z.number().min(0).optional(),
  executedAt: z.string().optional(),
  assetClass: z.enum(['crypto', 'security', 'other']).optional(),
})

export type EstimateFinnishTaxInput = z.infer<typeof estimateTaxInputSchema>

export type EstimateFinnishTaxResult =
  | { data: FinnishTaxEstimateResult }
  | { error: string }

function inferAssetClassFromTxs(
  txs: Transaction[],
  symbol: string
): TaxAssetClass {
  const upper = symbol.toUpperCase()
  const hit = txs.find((t) => t.symbol?.toUpperCase() === upper && t.asset_type !== 'cash')
  if (!hit) return 'crypto'
  if (hit.asset_type === 'crypto') return 'crypto'
  if (hit.asset_type === 'stock' || hit.asset_type === 'etf') return 'security'
  return 'other'
}

/**
 * Estimate Finnish capital-gains tax from the current user's recorded transactions.
 */
export async function estimateFinnishTax(
  raw: EstimateFinnishTaxInput
): Promise<EstimateFinnishTaxResult> {
  const parsed = estimateTaxInputSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = Object.values(parsed.error.flatten().fieldErrors)
      .flat()
      .join(', ')
    return { error: msg || 'Invalid tax estimate input' }
  }

  const user = await getCurrentUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  const input = parsed.data
  const taxYear = input.taxYear ?? new Date().getUTCFullYear()
  const mode = input.mode as EstimateMode

  if (mode === 'hypothetical_sell' || (mode === 'full' && input.symbol)) {
    if (mode === 'hypothetical_sell') {
      if (!input.symbol || input.quantity === undefined) {
        return { error: 'Hypothetical sell requires symbol and quantity.' }
      }
      if (input.unitPrice === undefined) {
        return {
          error:
            'Hypothetical sell requires unitPrice (EUR or set unitPriceCurrency).',
        }
      }
    }
  }

  try {
    const usdToEurRate = await getUsdToEurRate()
    const txs = (await getUserTransactions()) as Transaction[]
    const events = appTransactionsToTaxableEvents(txs, { usdToEurRate })

    let hypothetical:
      | {
          assetKey: string
          quantity: number
          unitPriceEur: number
          executedAt?: string
          feeEur?: number
          assetClass?: TaxAssetClass
        }
      | undefined

    if (input.symbol && input.quantity !== undefined && input.unitPrice !== undefined) {
      const priceCurrency = input.unitPriceCurrency ?? 'EUR'
      const unitPriceEur = convertBetweenCurrencies(
        input.unitPrice,
        priceCurrency,
        'EUR',
        usdToEurRate
      )
      hypothetical = {
        assetKey: input.symbol.toUpperCase(),
        quantity: input.quantity,
        unitPriceEur,
        executedAt: input.executedAt,
        feeEur: input.sellingCostsEur ?? 0,
        assetClass:
          input.assetClass ?? inferAssetClassFromTxs(txs, input.symbol),
      }
    } else if (mode === 'hypothetical_sell') {
      return { error: 'Hypothetical sell requires symbol, quantity, and unitPrice.' }
    }

    if (mode === 'full' && !hypothetical && input.symbol) {
      return {
        error: 'Full mode with a symbol also needs quantity and unitPrice for the what-if sell.',
      }
    }

    const data = estimateFinnishCapitalGains({
      events,
      taxYear,
      mode,
      hypothetical,
      otherCapitalIncomeEur: input.otherCapitalIncomeEur ?? 0,
    })

    return { data }
  } catch (err) {
    console.error('estimateFinnishTax failed:', err)
    return {
      error: err instanceof Error ? err.message : 'Tax estimate failed',
    }
  }
}
