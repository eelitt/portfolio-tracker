import { tool } from 'ai'
import { z } from 'zod'
import { computeDrift, suggestMixFromProfile, suggestRebalance } from '@/lib/allocationTargets'
import { getAllocationPolicy } from '@/app/actions/allocation'
import { getCurrentUserProfile } from '@/lib/user'
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
  }
}
