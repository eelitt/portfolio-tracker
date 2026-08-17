import { z } from 'zod'
import { getPortfolioData, type PortfolioData } from '@/lib/portfolioData'
import { toolFailure } from '@/lib/aiTools'
import type { EnrichedHolding, Transaction } from '@/lib/types'

export const assetTypeSchema = z.enum(['stock', 'etf', 'crypto', 'cash'])

export function round2(n: number) {
  return Number(n.toFixed(2))
}

export type PortfolioAnalystToolOptions = {
  lastUserText?: string
  evalPortfolio?: PortfolioData
  evalMode?: boolean
  dryRun?: boolean
}

export type LoadedPortfolio =
  | {
      ok: true
      data: PortfolioData
      holdings: EnrichedHolding[]
      transactions: Transaction[]
    }
  | { ok: false; error: string }

export async function loadUserPortfolio(
  evalPortfolio?: PortfolioData
): Promise<LoadedPortfolio> {
  if (evalPortfolio) {
    if (evalPortfolio.error) {
      return { ok: false, error: evalPortfolio.error }
    }
    return {
      ok: true,
      data: evalPortfolio,
      holdings: evalPortfolio.enrichedHoldings as EnrichedHolding[],
      transactions: (evalPortfolio.transactions || []) as Transaction[],
    }
  }

  const data = await getPortfolioData()
  if (data.error) {
    return { ok: false, error: data.error }
  }
  return {
    ok: true,
    data,
    holdings: data.enrichedHoldings as EnrichedHolding[],
    transactions: (data.transactions || []) as Transaction[],
  }
}

/** Per-request state shared by all analyst tools. */
export type AnalystToolCtx = {
  userId: string
  lastUserText: string
  evalMode: boolean
  dryRun: boolean
  noPersist: boolean
  preparedThisRequest: { value: boolean }
  load: () => Promise<LoadedPortfolio>
  loadFailed: (error: string) => ReturnType<typeof toolFailure>
}

export function createAnalystToolCtx(
  userId: string,
  options: PortfolioAnalystToolOptions = {}
): AnalystToolCtx {
  const evalPortfolio = options.evalPortfolio
  const dryRun = options.dryRun === true
  const evalMode = options.evalMode === true || !!evalPortfolio
  return {
    userId,
    lastUserText: options.lastUserText ?? '',
    evalMode,
    dryRun,
    noPersist: evalMode || dryRun,
    preparedThisRequest: { value: false },
    load: () => loadUserPortfolio(evalPortfolio),
    loadFailed: (error: string) => toolFailure('portfolio_load_failed', error),
  }
}
