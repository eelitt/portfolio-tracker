import { tool } from 'ai'
import { z } from 'zod'
import {
  simulateSellFraction,
  simulatePriceShock,
} from '@/lib/portfolioAnalyst'
import { toolDescription, toolFailure } from '@/lib/aiTools'
import type { AnalystToolCtx } from './toolContext'

export function createScenarioTools(ctx: AnalystToolCtx) {
  const { load, loadFailed } = ctx

  return {
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
        if (!loaded.ok) return loadFailed(loaded.error)
        const currency = loaded.data.preferredCurrency

        if (args.type === 'sell_fraction') {
          if (!args.symbol) {
            return toolFailure(
              'invalid_scenario_args',
              'sell_fraction requires symbol.'
            )
          }
          const result = simulateSellFraction(loaded.holdings, {
            symbol: args.symbol,
            fraction: args.fraction,
            quantity: args.quantity,
          })
          return { preferredCurrency: currency, ...result }
        }

        if (!args.shocks?.length) {
          return toolFailure(
            'invalid_scenario_args',
            'price_shock requires a non-empty shocks array.'
          )
        }
        const result = simulatePriceShock(loaded.holdings, args.shocks)
        return { preferredCurrency: currency, ...result }
      },
    }),
  }
}
