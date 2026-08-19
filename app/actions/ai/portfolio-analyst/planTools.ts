import { tool } from 'ai'
import { z } from 'zod'
import { computeDrift, suggestMixFromProfile, suggestRebalance } from '@/lib/allocationTargets'
import { getAllocationPolicy } from '@/app/actions/allocation'
import { getAssumptionRates } from '@/app/actions/assumptions'
import { getUserGoals } from '@/app/actions/goals'
import { getCurrentUserProfile } from '@/lib/user'
import {
  assignedPv,
  evaluateGoal,
  evaluateGoalFromDate,
  expectedReturnFromSlices,
  fundingWarning,
  usedCryptoRates,
} from '@/lib/projections'
import { toolDescription, toolFailure } from '@/lib/aiTools'
import type { AnalystToolCtx } from './toolContext'

export function createPlanTools(ctx: AnalystToolCtx) {
  const { load, loadFailed } = ctx

  return {
    get_target_allocation: tool({
      description: toolDescription('get_target_allocation'),
      parameters: z.object({}),
      execute: async () => {
        const loaded = await load()
        if (!loaded.ok) return loadFailed(loaded.error)
        const policy = await getAllocationPolicy()
        if (policy.error) {
          return toolFailure('portfolio_load_failed', policy.error)
        }
        if (!policy.data) {
          return toolFailure(
            'no_target_policy',
            'No target allocation saved. The user can set type weights in the Plan sidebar.'
          )
        }
        const drift = computeDrift(loaded.holdings, policy.data)
        return {
          preferredCurrency: loaded.data.preferredCurrency,
          tolerancePp: policy.data.tolerancePp,
          typeTargets: policy.data.typeWeights,
          symbolOverrides: policy.data.symbolOverrides,
          ...drift,
        }
      },
    }),

    get_rebalance_plan: tool({
      description: toolDescription('get_rebalance_plan'),
      parameters: z.object({
        mode: z
          .enum(['inplace', 'new_cash'])
          .optional()
          .describe('inplace (default) or new_cash'),
        cashIn: z
          .number()
          .positive()
          .optional()
          .describe('For new_cash: amount of new cash in preferred currency'),
      }),
      execute: async (args) => {
        const loaded = await load()
        if (!loaded.ok) return loadFailed(loaded.error)
        const policy = await getAllocationPolicy()
        if (policy.error) {
          return toolFailure('portfolio_load_failed', policy.error)
        }
        if (!policy.data) {
          return toolFailure(
            'no_target_policy',
            'No target allocation saved. The user can set type weights in the Plan sidebar.'
          )
        }
        const mode = args.mode ?? 'inplace'
        const plan = suggestRebalance(loaded.holdings, policy.data, {
          mode,
          cashIn: args.cashIn,
        })
        return {
          preferredCurrency: loaded.data.preferredCurrency,
          mode,
          ...plan,
        }
      },
    }),

    suggest_allocation_mix: tool({
      description: toolDescription('suggest_allocation_mix'),
      parameters: z.object({}),
      execute: async () => {
        const profile = await getCurrentUserProfile()
        if (!profile) {
          return toolFailure('not_authenticated', 'Not signed in.')
        }
        const mix = suggestMixFromProfile({
          ageBand: profile.ageBand,
          horizon: profile.horizon,
          riskTolerance: profile.riskTolerance,
          monthlyContribution: profile.monthlyContribution,
        })
        if (!mix.ok) {
          return {
            ...toolFailure(
              'profile_incomplete',
              mix.notes[0] ?? 'Investor profile is incomplete.'
            ),
            missing: mix.missing,
          }
        }
        return mix
      },
    }),

    get_goal_projection: tool({
      description: toolDescription('get_goal_projection'),
      parameters: z.object({
        goalId: z.string().optional().describe('Specific goal id; omit for all open goals'),
        monthly: z
          .number()
          .nonnegative()
          .optional()
          .describe('Override planned monthly contribution'),
        months: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Override months to target (instead of the goal date)'),
      }),
      execute: async (args) => {
        const loaded = await load()
        if (!loaded.ok) return loadFailed(loaded.error)

        const cryptoSymbols = loaded.holdings
          .filter((h) => h.asset_type === 'crypto')
          .map((h) => h.symbol)
        const [goals, assumptions] = await Promise.all([
          getUserGoals(),
          getAssumptionRates({ symbols: cryptoSymbols }),
        ])

        if (goals.length === 0) {
          return toolFailure('no_goals', 'No goals saved. The user can add one in the Plan sidebar.')
        }

        const selected = args.goalId
          ? goals.filter((g) => g.id === args.goalId)
          : goals.filter((g) => !g.is_completed)
        if (args.goalId && selected.length === 0) {
          return toolFailure('goal_not_found', 'No goal matches that id.')
        }

        const slices = loaded.holdings
          .filter(
            (h) => (h.asset_type === 'cash' || h.priceAvailable) && h.marketValue > 0
          )
          .map((h) => ({
            symbol: h.symbol,
            assetType: h.asset_type,
            marketValue: h.marketValue,
          }))
        const annualRate = expectedReturnFromSlices(
          slices,
          usedCryptoRates(assumptions),
          assumptions.fallbackCrypto
        )
        const bookMv = loaded.data.totalMarketValue
        const warning = fundingWarning(
          selected
            .filter((g) => !g.is_completed)
            .map((g) => ({ assignedAmount: g.assigned_amount ?? null })),
          bookMv
        )

        const rows = selected.map((g) => {
          const pv = assignedPv(bookMv, g.assigned_amount ?? null)
          const planned =
            args.monthly != null ? args.monthly : (g.planned_monthly ?? null)
          const projection =
            args.months != null
              ? evaluateGoal({
                  pv,
                  target: g.target_amount,
                  annualRate,
                  months: args.months,
                  plannedMonthly: planned,
                })
              : evaluateGoalFromDate({
                  pv,
                  target: g.target_amount,
                  annualRate,
                  targetDate: g.target_date ?? null,
                  plannedMonthly: planned,
                })
          return {
            id: g.id,
            name: g.name,
            targetDate: g.target_date ?? null,
            assignedAmount: g.assigned_amount ?? null,
            isCompleted: g.is_completed,
            ...projection,
          }
        })

        return {
          preferredCurrency: loaded.data.preferredCurrency,
          annualRate,
          fallbackCrypto: assumptions.fallbackCrypto,
          coins: assumptions.coins,
          fundingWarning: warning,
          goals: rows,
        }
      },
    }),
  }
}
