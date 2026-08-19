import type { Goal } from '@/lib/types'
import {
  evaluateGoalFromDate,
  expectedReturnFromSlices,
  goalStartingValue,
  monthDepositAmount,
  monthsToTarget,
  projectValue,
  usedCryptoRates,
  type AssumptionPack,
  type GoalProjection,
  type InflowMonth,
  type ReturnSlice,
} from '@/lib/projections'

export type GoalCardModel = {
  includeCash: boolean
  pv: number
  annualRate: number
  actualMonthlyInflow: number
  depositMonths: InflowMonth[]
  slicesForReturn: ReturnSlice[]
  pct: number
  proj: GoalProjection | null
  growthOnlyAtDate: number | null
  hitMonthsGrowthOnly: number | null
}

export function buildGoalCardModel(input: {
  goal: Goal
  portfolioValue: number
  returnSlices: ReturnSlice[]
  assumptions: AssumptionPack
  monthlyBuys: number
  monthlyCash: number
  inflowByMonth: InflowMonth[]
}): GoalCardModel {
  const includeCash = input.goal.include_cash !== false
  const cashMv = input.returnSlices
    .filter((s) => s.assetType === 'cash')
    .reduce((s, x) => s + x.marketValue, 0)
  const slicesForReturn = includeCash
    ? input.returnSlices
    : input.returnSlices.filter((s) => s.assetType !== 'cash')
  const annualRate = expectedReturnFromSlices(
    slicesForReturn,
    usedCryptoRates(input.assumptions),
    input.assumptions.fallbackCrypto
  )
  const pv = goalStartingValue({
    portfolioMv: input.portfolioValue,
    cashMv,
    assignedAmount: input.goal.assigned_amount ?? null,
    includeCash,
  })
  const proj = input.goal.is_completed
    ? null
    : evaluateGoalFromDate({
        pv,
        target: input.goal.target_amount,
        annualRate,
        targetDate: input.goal.target_date ?? null,
        plannedMonthly: input.goal.planned_monthly ?? null,
      })
  const growthOnlyAtDate =
    proj?.months != null
      ? projectValue({
          pv,
          pmt: 0,
          annualRate,
          months: proj.months,
        })
      : null
  const hitMonthsGrowthOnly = input.goal.is_completed
    ? null
    : monthsToTarget({
        pv,
        target: input.goal.target_amount,
        pmt: 0,
        annualRate,
      })

  return {
    includeCash,
    pv,
    annualRate,
    actualMonthlyInflow:
      input.monthlyBuys + (includeCash ? input.monthlyCash : 0),
    depositMonths: input.inflowByMonth.map((row) => ({
      ...row,
      amount: monthDepositAmount(row, includeCash),
    })),
    slicesForReturn,
    pct:
      input.goal.target_amount > 0
        ? Math.min(100, Math.round((pv / input.goal.target_amount) * 100))
        : 0,
    proj,
    growthOnlyAtDate,
    hitMonthsGrowthOnly,
  }
}
