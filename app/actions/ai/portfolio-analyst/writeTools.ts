import { tool } from 'ai'
import { z } from 'zod'
import {
  validateTransactionDraft,
  sellExceedsHoldingWarning,
} from '@/lib/portfolioAnalyst'
import { createTransactionRecord } from '@/app/actions/transactions'
import {
  savePendingTxDraft,
  getPendingTxDraft,
  clearPendingTxDraft,
} from '@/app/actions/ai/portfolio-analyst/pendingDraft'
import {
  toolDescription,
  assertWriteAllowed,
  withRecovery,
  confirmLevelForPrepare,
  CONFIRM_LEVEL_WRITE,
  needsElevatedConfirm,
  dryRunNote,
} from '@/lib/aiTools'
import { assetTypeSchema, type AnalystToolCtx } from './toolContext'

export function createWriteTools(ctx: AnalystToolCtx) {
  const {
    userId,
    lastUserText,
    evalMode,
    dryRun,
    noPersist,
    preparedThisRequest,
    load,
  } = ctx

  return {
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
          const elevated = needsElevatedConfirm(confirmLevel)

          if (!noPersist) {
            await savePendingTxDraft(userId, {
              sourceText: args.sourceText,
              draft: result.draft,
              summary: result.summary || '',
              warnings: result.warnings,
              preparedAt: new Date().toISOString(),
              requiresElevatedConfirm: elevated,
            })
          }
          preparedThisRequest.value = true

          const nextStep = dryRun
            ? 'Dry-run: show the draft summary and what would be saved. Do not claim it was logged. Do not call confirm_transaction as a real save.'
            : elevated
              ? 'Show the summary AND all warnings clearly. Ask them to reply "confirm sell" or "confirm trade" in a NEW message (not only "yes"). Do not call confirm_transaction this turn.'
              : 'Show the summary to the user and ask them to reply "confirm" (or yes) in a NEW message to save. Do not call confirm_transaction in this turn — the server will reject it.'

          return {
            ...result,
            pendingStored: !noPersist,
            evalMode: evalMode || undefined,
            confirmLevel,
            requiresElevatedConfirm: elevated || undefined,
            ...(dryRun
              ? dryRunNote(
                  elevated
                    ? 'prepare_transaction → elevated confirm → confirm_transaction'
                    : 'prepare_transaction → user confirm → confirm_transaction'
                )
              : {}),
            nextStep,
          }
        }

        if (!noPersist) {
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

        if (evalMode) {
          const gate = assertWriteAllowed({
            toolId: 'confirm_transaction',
            lastUserText,
            preparedThisRequest: preparedThisRequest.value,
            hasPendingDraft: true,
            evalMode: true,
            requiresElevatedConfirm: false,
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
          preparedThisRequest: preparedThisRequest.value,
          hasPendingDraft: Boolean(pending),
          evalMode: false,
          requiresElevatedConfirm: pending?.requiresElevatedConfirm === true,
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
