/**
 * AI SDK tools for Portfolio Analyst.
 *
 * Production: loadUserPortfolio → getPortfolioData (RLS).
 * Admin eval: optional evalPortfolio snapshot + evalMode so prepare/confirm
 * never write pending drafts or transactions. Chat route must not pass those opts.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { getPortfolioData, type PortfolioData } from '@/lib/portfolioData'
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
import {
  toolDescription,
  assertWriteAllowed,
  withRecovery,
  confirmLevelForPrepare,
  CONFIRM_LEVEL_WRITE,
  dryRunNote,
} from '@/lib/aiTools'

export { isExplicitConfirmMessage } from './confirmGate'

const assetTypeSchema = z.enum(['stock', 'etf', 'crypto', 'cash'])

function round2(n: number) {
  return Number(n.toFixed(2))
}

export type PortfolioAnalystToolOptions = {
  /** Latest user message text for this HTTP request (confirm gate). */
  lastUserText?: string
  /**
   * When set (admin eval suite only), tools read this snapshot instead of the DB.
   * Chat route must never pass this.
   */
  evalPortfolio?: PortfolioData
  /** When true, prepare/confirm never write pending drafts or transactions. */
  evalMode?: boolean
  /**
   * Dry-run: validate/prepare shape without storing drafts or writing txs.
   * Implies no side-effect writes (same as evalMode for persistence).
   */
  dryRun?: boolean
}

/** Live DB portfolio, or injected eval snapshot when provided. */
async function loadUserPortfolio(
  evalPortfolio?: PortfolioData
): Promise<
  | {
      ok: true
      data: PortfolioData
      holdings: EnrichedHolding[]
      transactions: Transaction[]
    }
  | { ok: false; error: string }
> {
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

/**
 * Build the tool set for a single request.
 * @param userId — authenticated user (pending NL drafts are scoped to this id)
 * @param options.lastUserText — used to hard-gate confirm_transaction
 * @param options.evalPortfolio / evalMode — admin eval only; never from chat route
 */
export function createPortfolioAnalystTools(
  userId: string,
  options: PortfolioAnalystToolOptions = {}
) {
  /** Blocks prepare + confirm in the same agent HTTP request (maxSteps). */
  let preparedThisRequest = false
  const lastUserText = options.lastUserText ?? ''
  const evalPortfolio = options.evalPortfolio
  const dryRun = options.dryRun === true
  // evalPortfolio alone implies evalMode (safer default for suite injection)
  // dryRun also blocks persistence (preview only)
  const evalMode =
    options.evalMode === true || !!evalPortfolio || dryRun

  const load = () => loadUserPortfolio(evalPortfolio)

  return {
    get_portfolio_summary: tool({
      description: toolDescription('get_portfolio_summary'),
      parameters: z.object({}),
      execute: async () => {
        const loaded = await load()
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
      description: toolDescription('get_allocation'),
      parameters: z.object({}),
      execute: async () => {
        const loaded = await load()
        if (!loaded.ok) return { error: loaded.error }
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
      description: toolDescription('simulate_scenario'),
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
        const loaded = await load()
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
      description: toolDescription('prepare_transaction'),
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
          const loaded = await load()
          if (loaded.ok) {
            const held = loaded.holdings.find(
              (h) => h.symbol.toUpperCase() === result.draft!.symbol.toUpperCase()
            )
            const w = sellExceedsHoldingWarning(result.draft, held?.quantity)
            if (w) result.warnings.push(w)
          }

          const confirmLevel = confirmLevelForPrepare({
            status: result.status,
            warnings: result.warnings,
          })

          // Production: persist pending draft for a later confirm turn.
          // Eval / dry-run: skip storage so we never mutate real pending drafts.
          if (!evalMode) {
            await savePendingTxDraft(userId, {
              sourceText: args.sourceText,
              draft: result.draft,
              summary: result.summary || '',
              warnings: result.warnings,
              preparedAt: new Date().toISOString(),
            })
          }
          preparedThisRequest = true

          const nextStep = dryRun
            ? 'Dry-run: show the draft summary and what would be saved. Do not claim it was logged. Do not call confirm_transaction as a real save.'
            : confirmLevel === 'soft'
              ? 'Show the summary AND all warnings clearly, then ask them to reply "confirm" in a NEW message to save. Do not call confirm_transaction this turn.'
              : 'Show the summary to the user and ask them to reply "confirm" (or yes) in a NEW message to save. Do not call confirm_transaction in this turn — the server will reject it.'

          return {
            ...result,
            pendingStored: !evalMode,
            evalMode: evalMode && !dryRun ? true : undefined,
            confirmLevel,
            ...(dryRun
              ? dryRunNote('prepare_transaction → user confirm → confirm_transaction')
              : {}),
            nextStep,
          }
        }

        // Not ready — clear any old pending so confirm cannot save a stale trade
        if (!evalMode) {
          await clearPendingTxDraft(userId)
        }
        const failureMode =
          result.status === 'incomplete'
            ? 'validation_incomplete'
            : 'validation_invalid'
        return withRecovery({
          ...result,
          pendingStored: false,
          confirmLevel: 'none' as const,
          failureMode,
          error:
            result.errors?.[0] ||
            (result.status === 'incomplete'
              ? 'Draft incomplete — need more details from the user.'
              : 'Draft invalid.'),
          ...(dryRun ? dryRunNote('prepare_transaction (incomplete)') : {}),
          nextStep:
            result.status === 'incomplete'
              ? 'Ask the user only for the missing fields listed, then call prepare_transaction again with sourceText = original + their reply.'
              : 'Explain the errors; do not call confirm_transaction.',
        })
      },
    }),

    confirm_transaction: tool({
      description: toolDescription('confirm_transaction'),
      parameters: z.object({
        usePendingDraft: z
          .boolean()
          .optional()
          .describe('Must be true (default). Only the pending draft from prepare_transaction can be saved.'),
      }),
      execute: async (args) => {
        // Dry-run: never write; describe what confirm would do after a real prepare
        if (dryRun) {
          return withRecovery({
            ok: false as const,
            errors: [
              'Dry-run: confirm_transaction does not save. A real confirm would require a pending draft and an explicit "confirm" message.',
            ],
            missing: [],
            warnings: [],
            failureMode: 'dry_run_blocked_write',
            confirmLevel: CONFIRM_LEVEL_WRITE,
            ...dryRunNote('confirm_transaction (blocked — no write)'),
          })
        }

        // Eval: exercise confirm gates without createTransactionRecord
        if (evalMode) {
          const gate = assertWriteAllowed({
            toolId: 'confirm_transaction',
            lastUserText,
            preparedThisRequest,
            hasPendingDraft: true,
            evalMode: true,
          })
          if (!gate.ok) {
            return withRecovery({
              ok: false as const,
              errors: gate.errors,
              missing: [],
              warnings: [],
              evalMode: true,
              failureMode: gate.failureMode,
              confirmLevel: CONFIRM_LEVEL_WRITE,
            })
          }
          return withRecovery({
            ok: false as const,
            errors: ['Eval mode: confirm is not persisted.'],
            missing: [],
            warnings: [],
            evalMode: true,
            failureMode: 'eval_mode_no_persist',
            confirmLevel: CONFIRM_LEVEL_WRITE,
          })
        }

        if (args.usePendingDraft === false) {
          return withRecovery({
            ok: false as const,
            errors: [
              'Only pending drafts can be confirmed. Call prepare_transaction first, then confirm after the user replies.',
            ],
            missing: [],
            warnings: [],
            failureMode: 'validation_invalid',
            confirmLevel: CONFIRM_LEVEL_WRITE,
          })
        }

        const pending = await getPendingTxDraft(userId)
        const gate = assertWriteAllowed({
          toolId: 'confirm_transaction',
          lastUserText,
          preparedThisRequest,
          hasPendingDraft: Boolean(pending),
          evalMode: false,
        })
        if (!gate.ok) {
          return withRecovery({
            ok: false as const,
            errors: gate.errors,
            missing: [],
            warnings: [],
            failureMode: gate.failureMode,
            confirmLevel: CONFIRM_LEVEL_WRITE,
          })
        }

        if (!pending) {
          return withRecovery({
            ok: false as const,
            errors: [
              'No pending draft to confirm. Ask the user to describe the trade again, then call prepare_transaction.',
            ],
            missing: [],
            warnings: [],
            failureMode: 'no_pending_draft',
            confirmLevel: CONFIRM_LEVEL_WRITE,
          })
        }

        const sourceText = pending.sourceText
        const d = pending.draft
        const pendingWarnings = pending.warnings
        const fromPending = true

        const validated = validateTransactionDraft({
          sourceText,
          symbol: d.symbol,
          asset_type: d.asset_type,
          action: d.action,
          quantity: d.quantity,
          unit_price: d.unit_price,
          executed_at: d.executed_at,
          notes: d.notes,
          currency: d.currency,
        })

        if (validated.status !== 'ready' || !validated.draft) {
          return withRecovery({
            ok: false as const,
            status: validated.status,
            missing: validated.missing,
            errors: validated.errors.length
              ? validated.errors
              : ['Draft is not ready to save. Fix missing fields and prepare again.'],
            warnings: validated.warnings,
            fromPending,
            failureMode:
              validated.status === 'incomplete'
                ? 'validation_incomplete'
                : 'validation_failed',
            confirmLevel: CONFIRM_LEVEL_WRITE,
          })
        }

        const draft = validated.draft
        const loaded = await load()
        const warnings = [...pendingWarnings, ...validated.warnings]
        if (loaded.ok) {
          const held = loaded.holdings.find(
            (h) => h.symbol.toUpperCase() === draft.symbol.toUpperCase()
          )
          const w = sellExceedsHoldingWarning(draft, held?.quantity)
          if (w) warnings.push(w)
        }

        const created = await createTransactionRecord(
          {
            symbol: draft.symbol,
            asset_type: draft.asset_type,
            action: draft.action,
            quantity: draft.quantity,
            unit_price: draft.unit_price,
            executed_at: draft.executed_at,
            notes: draft.notes,
            currency: draft.currency,
          },
          { requireCurrency: true }
        )

        if (!created.ok) {
          return withRecovery({
            ok: false as const,
            errors: [created.error],
            missing: [],
            warnings,
            fromPending,
            failureMode: 'insert_failed',
            confirmLevel: CONFIRM_LEVEL_WRITE,
          })
        }

        await clearPendingTxDraft(userId)

        return {
          ok: true as const,
          summary: validated.summary,
          confirmLevel: CONFIRM_LEVEL_WRITE,
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
