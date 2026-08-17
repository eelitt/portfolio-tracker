import { tool } from 'ai'
import { z } from 'zod'
import {
  filterEnrichedHoldings,
  allocationBreakdown,
  realizedPnlFromTransactions,
  compactTransactions,
} from '@/lib/portfolioAnalyst'
import { toolDescription } from '@/lib/aiTools'
import {
  assetTypeSchema,
  round2,
  type AnalystToolCtx,
} from './toolContext'

export function createReadTools(ctx: AnalystToolCtx) {
  const { load, loadFailed } = ctx

  return {
    get_portfolio_summary: tool({
      description: toolDescription('get_portfolio_summary'),
      parameters: z.object({}),
      execute: async () => {
        const loaded = await load()
        if (!loaded.ok) return loadFailed(loaded.error)
        const { data } = loaded
        return {
          preferredCurrency: data.preferredCurrency,
          totalMarketValue: round2(data.totalMarketValue),
          totalCost: round2(data.totalCost),
          totalUnrealizedPnl: round2(data.totalUnrealizedPnl),
          total24hChange: round2(data.total24hChange),
          total24hChangePercent: round2(data.total24hChangePercent),
          holdingsCount: data.holdingsCount,
          assetCount: data.assetCount,
          pricedAssetCount: data.pricedAssetCount,
          unpricedSymbols: data.unpricedSymbols,
          transactionCount: (data.transactions || []).length,
        }
      },
    }),

    get_holdings: tool({
      description: toolDescription('get_holdings'),
      parameters: z.object({
        assetType: assetTypeSchema.optional(),
        symbol: z.string().optional().describe('Ticker symbol, e.g. BTC or AAPL'),
        minUnrealizedPnlPercent: z
          .number()
          .optional()
          .describe('Minimum unrealized P&L % (e.g. 25 for winners over 25%)'),
        maxUnrealizedPnlPercent: z
          .number()
          .optional()
          .describe('Maximum unrealized P&L % (e.g. -25 for losers down more than 25%)'),
        pricedOnly: z.boolean().optional(),
        sortBy: z
          .enum(['marketValue', 'unrealizedPnlPercent', 'unrealizedPnl', 'symbol'])
          .optional(),
        sortDir: z.enum(['asc', 'desc']).optional(),
        limit: z.number().int().min(1).max(30).optional(),
      }),
      execute: async (args) => {
        const loaded = await load()
        if (!loaded.ok) return loadFailed(loaded.error)
        const holdings = filterEnrichedHoldings(loaded.holdings, {
          assetType: args.assetType,
          symbol: args.symbol,
          minUnrealizedPnlPercent: args.minUnrealizedPnlPercent,
          maxUnrealizedPnlPercent: args.maxUnrealizedPnlPercent,
          pricedOnly: args.pricedOnly,
          sortBy: args.sortBy,
          sortDir: args.sortDir,
          limit: args.limit,
        })
        return {
          preferredCurrency: loaded.data.preferredCurrency,
          count: holdings.length,
          holdings,
        }
      },
    }),

    get_allocation: tool({
      description: toolDescription('get_allocation'),
      parameters: z.object({}),
      execute: async () => {
        const loaded = await load()
        if (!loaded.ok) return loadFailed(loaded.error)
        const breakdown = allocationBreakdown(loaded.holdings)
        return {
          preferredCurrency: loaded.data.preferredCurrency,
          ...breakdown,
        }
      },
    }),

    get_realized_pnl: tool({
      description: toolDescription('get_realized_pnl'),
      parameters: z.object({
        year: z.number().int().optional().describe('Calendar year of sells, e.g. 2026'),
        assetType: assetTypeSchema.optional(),
        symbol: z.string().optional(),
      }),
      execute: async (args) => {
        const loaded = await load()
        if (!loaded.ok) return loadFailed(loaded.error)
        const result = realizedPnlFromTransactions(loaded.transactions, {
          year: args.year,
          assetType: args.assetType,
          symbol: args.symbol,
        })
        return {
          preferredCurrency: loaded.data.preferredCurrency,
          filters: {
            year: args.year ?? null,
            assetType: args.assetType ?? null,
            symbol: args.symbol ?? null,
          },
          ...result,
        }
      },
    }),

    get_transactions: tool({
      description: toolDescription('get_transactions'),
      parameters: z.object({
        symbol: z.string().optional(),
        assetType: assetTypeSchema.optional(),
        action: z.enum(['buy', 'sell', 'inflow', 'outflow']).optional(),
        year: z.number().int().optional(),
        limit: z.number().int().min(1).max(40).optional(),
      }),
      execute: async (args) => {
        const loaded = await load()
        if (!loaded.ok) return loadFailed(loaded.error)
        const list = compactTransactions(loaded.transactions, {
          symbol: args.symbol,
          assetType: args.assetType,
          action: args.action,
          year: args.year,
          limit: args.limit,
        })
        return {
          preferredCurrency: loaded.data.preferredCurrency,
          count: list.length,
          transactions: list,
        }
      },
    }),
  }
}
