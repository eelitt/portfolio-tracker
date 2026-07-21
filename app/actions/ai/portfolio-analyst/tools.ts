/**
 * AI SDK tools for Portfolio Analyst.
 * Execute paths always load the current user's data server-side (RLS).
 */

import { tool } from 'ai'
import { z } from 'zod'
import { getPortfolioData } from '@/lib/portfolioData'
import {
  filterEnrichedHoldings,
  allocationBreakdown,
  realizedPnlFromTransactions,
  simulateSellFraction,
  simulatePriceShock,
  compactTransactions,
  validateTransactionDraft,
  sellExceedsHoldingWarning,
} from '@/lib/portfolioAnalyst'
import { createTransactionRecord } from '@/app/actions/transactions'
import {
  savePendingTxDraft,
  getPendingTxDraft,
  clearPendingTxDraft,
} from '@/app/actions/ai/portfolio-analyst/pendingDraft'
import type { EnrichedHolding, Transaction } from '@/lib/types'

const assetTypeSchema = z.enum(['stock', 'etf', 'crypto', 'cash'])

function round2(n: number) {
  return Number(n.toFixed(2))
}

async function loadUserPortfolio(): Promise<
  | {
      ok: true
      data: Awaited<ReturnType<typeof getPortfolioData>>
      holdings: EnrichedHolding[]
      transactions: Transaction[]
    }
  | { ok: false; error: string }
> {
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

/**
 * Build the tool set for a single request.
 * @param userId — authenticated user (pending NL drafts are scoped to this id)
 */
export function createPortfolioAnalystTools(userId: string) {
  return {
    get_portfolio_summary: tool({
      description:
        'Get high-level portfolio totals: market value, cost, unrealized P&L, 24h change, preferred currency, holding counts, and unpriced symbols.',
      parameters: z.object({}),
      execute: async () => {
        const loaded = await loadUserPortfolio()
        if (!loaded.ok) return { error: loaded.error }
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
      description:
        'List open holdings with optional filters (asset type, symbol, unrealized P&L % thresholds). Use for questions like positions down more than X%.',
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
        const loaded = await loadUserPortfolio()
        if (!loaded.ok) return { error: loaded.error }
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
      description:
        'Get portfolio allocation weights by symbol and by asset type (priced assets + cash only).',
      parameters: z.object({}),
      execute: async () => {
        const loaded = await loadUserPortfolio()
        if (!loaded.ok) return { error: loaded.error }
        const breakdown = allocationBreakdown(loaded.holdings)
        return {
          preferredCurrency: loaded.data.preferredCurrency,
          ...breakdown,
        }
      },
    }),

    get_realized_pnl: tool({
      description:
        'Compute realized P&L from sell/outflow transactions using weighted average cost. Optional filters: calendar year, asset type, symbol.',
      parameters: z.object({
        year: z.number().int().optional().describe('Calendar year of sells, e.g. 2026'),
        assetType: assetTypeSchema.optional(),
        symbol: z.string().optional(),
      }),
      execute: async (args) => {
        const loaded = await loadUserPortfolio()
        if (!loaded.ok) return { error: loaded.error }
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
      description:
        'List recent transactions with optional filters. Hard limit 40. Use for grounding specific trade history questions.',
      parameters: z.object({
        symbol: z.string().optional(),
        assetType: assetTypeSchema.optional(),
        action: z.enum(['buy', 'sell', 'inflow', 'outflow']).optional(),
        year: z.number().int().optional(),
        limit: z.number().int().min(1).max(40).optional(),
      }),
      execute: async (args) => {
        const loaded = await loadUserPortfolio()
        if (!loaded.ok) return { error: loaded.error }
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

    simulate_scenario: tool({
      description:
        'Run a hypothetical what-if without writing any data. Types: sell_fraction (sell % or qty of a position at current price) or price_shock (mark selected symbols up/down by %).',
      parameters: z.object({
        type: z.enum(['sell_fraction', 'price_shock']),
        symbol: z
          .string()
          .optional()
          .describe('Required for sell_fraction — position symbol'),
        fraction: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe('For sell_fraction: fraction of quantity to sell (0–1)'),
        quantity: z
          .number()
          .positive()
          .optional()
          .describe('For sell_fraction: absolute quantity to sell (overrides fraction)'),
        shocks: z
          .array(
            z.object({
              symbol: z.string(),
              priceChangePercent: z
                .number()
                .describe('e.g. -50 for 50% drawdown, 20 for +20%'),
            })
          )
          .optional()
          .describe('For price_shock: list of symbol shocks'),
      }),
      execute: async (args) => {
        const loaded = await loadUserPortfolio()
        if (!loaded.ok) return { error: loaded.error }
        const currency = loaded.data.preferredCurrency

        if (args.type === 'sell_fraction') {
          if (!args.symbol) {
            return { error: 'sell_fraction requires symbol.' }
          }
          const result = simulateSellFraction(loaded.holdings, {
            symbol: args.symbol,
            fraction: args.fraction,
            quantity: args.quantity,
          })
          return { preferredCurrency: currency, ...result }
        }

        if (!args.shocks?.length) {
          return { error: 'price_shock requires a non-empty shocks array.' }
        }
        const result = simulatePriceShock(loaded.holdings, args.shocks)
        return { preferredCurrency: currency, ...result }
      },
    }),

    prepare_transaction: tool({
      description:
        'Parse/validate a natural-language trade into a draft. Does NOT write to the database. ALWAYS call this when the user describes a buy/sell/deposit. On status=ready, stores a pending draft for confirm_transaction. Pass sourceText with the user’s words (must include € or $). European decimals: pass unit_price as 7.76 when they write 7,76.',
      parameters: z.object({
        sourceText: z
          .string()
          .min(1)
          .describe('User wording (include follow-ups that specify €/$ or ticker)'),
        symbol: z.string().optional().describe('Ticker e.g. LINK, ETH, AAPL'),
        asset_type: assetTypeSchema.optional(),
        action: z.enum(['buy', 'sell', 'inflow', 'outflow']).optional(),
        quantity: z.number().optional(),
        unit_price: z
          .number()
          .optional()
          .describe('Price per unit as a number (7.76 not "7,76"); cash uses amount as quantity'),
        executed_at: z
          .string()
          .optional()
          .describe('ISO date/time; convert "last Friday" yourself; omit to assume now'),
        notes: z.string().optional(),
        currency: z.enum(['USD', 'EUR']).optional().describe('Ignored if sourceText has €/$'),
      }),
      execute: async (args) => {
        const result = validateTransactionDraft({
          sourceText: args.sourceText,
          symbol: args.symbol,
          asset_type: args.asset_type,
          action: args.action,
          quantity: args.quantity,
          unit_price: args.unit_price,
          executed_at: args.executed_at,
          notes: args.notes,
          currency: args.currency,
        })

        if (result.status === 'ready' && result.draft) {
          const loaded = await loadUserPortfolio()
          if (loaded.ok) {
            const held = loaded.holdings.find(
              (h) => h.symbol.toUpperCase() === result.draft!.symbol.toUpperCase()
            )
            const w = sellExceedsHoldingWarning(result.draft, held?.quantity)
            if (w) result.warnings.push(w)
          }

          await savePendingTxDraft(userId, {
            sourceText: args.sourceText,
            draft: result.draft,
            summary: result.summary || '',
            warnings: result.warnings,
            preparedAt: new Date().toISOString(),
          })

          return {
            ...result,
            pendingStored: true,
            nextStep:
              'Show the summary to the user and ask them to reply "confirm" (or yes) to save. Do not save until they confirm.',
          }
        }

        // Not ready — clear any old pending so confirm cannot save a stale trade
        await clearPendingTxDraft(userId)
        return {
          ...result,
          pendingStored: false,
          nextStep:
            result.status === 'incomplete'
              ? 'Ask the user only for the missing fields listed, then call prepare_transaction again with sourceText = original + their reply.'
              : 'Explain the errors; do not call confirm_transaction.',
        }
      },
    }),

    confirm_transaction: tool({
      description:
        'Commit the pending transaction AFTER the user clearly confirms (e.g. "confirm", "yes", "log it"). Prefer usePendingDraft=true so a short "confirm" works without retyping the trade. Do NOT refuse confirmation messages — call this tool instead.',
      parameters: z.object({
        usePendingDraft: z
          .boolean()
          .optional()
          .describe('Default true. Load the last ready draft from prepare_transaction.'),
        sourceText: z
          .string()
          .optional()
          .describe('Only if usePendingDraft is false: full user wording with €/$ and ticker'),
        symbol: z.string().optional(),
        asset_type: assetTypeSchema.optional(),
        action: z.enum(['buy', 'sell', 'inflow', 'outflow']).optional(),
        quantity: z.number().optional(),
        unit_price: z.number().optional(),
        executed_at: z.string().optional(),
        notes: z.string().optional(),
        currency: z.enum(['USD', 'EUR']).optional(),
      }),
      execute: async (args) => {
        const usePending = args.usePendingDraft !== false

        let sourceText = args.sourceText
        let symbol = args.symbol
        let asset_type = args.asset_type
        let action = args.action
        let quantity = args.quantity
        let unit_price = args.unit_price
        let executed_at = args.executed_at
        let notes = args.notes
        let currency = args.currency
        let fromPending = false
        let pendingWarnings: string[] = []

        if (usePending) {
          const pending = await getPendingTxDraft(userId)
          if (pending) {
            fromPending = true
            sourceText = pending.sourceText
            symbol = pending.draft.symbol
            asset_type = pending.draft.asset_type
            action = pending.draft.action
            quantity = pending.draft.quantity
            unit_price = pending.draft.unit_price
            executed_at = pending.draft.executed_at
            notes = pending.draft.notes
            currency = pending.draft.currency
            pendingWarnings = pending.warnings
          } else if (!sourceText) {
            return {
              ok: false as const,
              errors: [
                'No pending draft to confirm. Ask the user to describe the trade again, then call prepare_transaction.',
              ],
              missing: [],
              warnings: [],
            }
          }
        }

        if (!sourceText) {
          return {
            ok: false as const,
            errors: ['sourceText or a pending draft is required to confirm.'],
            missing: [],
            warnings: [],
          }
        }

        const validated = validateTransactionDraft({
          sourceText,
          symbol,
          asset_type,
          action,
          quantity,
          unit_price,
          executed_at,
          notes,
          currency,
        })

        if (validated.status !== 'ready' || !validated.draft) {
          return {
            ok: false as const,
            status: validated.status,
            missing: validated.missing,
            errors: validated.errors.length
              ? validated.errors
              : ['Draft is not ready to save. Fix missing fields and prepare again.'],
            warnings: validated.warnings,
            fromPending,
          }
        }

        const d = validated.draft
        const loaded = await loadUserPortfolio()
        const warnings = [...pendingWarnings, ...validated.warnings]
        if (loaded.ok) {
          const held = loaded.holdings.find(
            (h) => h.symbol.toUpperCase() === d.symbol.toUpperCase()
          )
          const w = sellExceedsHoldingWarning(d, held?.quantity)
          if (w) warnings.push(w)
        }

        const created = await createTransactionRecord(
          {
            symbol: d.symbol,
            asset_type: d.asset_type,
            action: d.action,
            quantity: d.quantity,
            unit_price: d.unit_price,
            executed_at: d.executed_at,
            notes: d.notes,
            currency: d.currency,
          },
          { requireCurrency: true }
        )

        if (!created.ok) {
          return {
            ok: false as const,
            errors: [created.error],
            missing: [],
            warnings,
            fromPending,
          }
        }

        await clearPendingTxDraft(userId)

        return {
          ok: true as const,
          summary: validated.summary,
          fromPending,
          transaction: {
            symbol: created.data.symbol,
            assetType: created.data.asset_type,
            action: created.data.action,
            quantity: created.data.quantity,
            unitPrice: created.data.unit_price,
            executedAt: created.data.executed_at,
            currency: created.data.currency,
            notes: created.data.notes,
          },
          warnings: [...new Set(warnings)],
          note:
            created.data.action === 'sell' && created.data.asset_type !== 'cash'
              ? 'Sale proceeds were credited to Available Cash (same as manual sells). Refresh the dashboard if totals look stale.'
              : 'Transaction saved. Refresh the dashboard if totals look stale.',
        }
      },
    }),
  }
}

export type PortfolioAnalystTools = ReturnType<typeof createPortfolioAnalystTools>
