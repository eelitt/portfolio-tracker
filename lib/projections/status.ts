import type { MonthlyContribution } from '@/lib/allocationTargets'
import { monthsToTarget, monthsUntil, projectValue, requiredMonthly } from './compound'
import type { FundingWarning, GoalProjection, GoalStatus } from './types'

const ON_TRACK_EPS = 1e-6

export function assignedPv(
  portfolioMv: number,
  assignedAmount: number | null | undefined
): number {
  if (assignedAmount == null) return Number(portfolioMv) || 0
  return Number(assignedAmount) || 0
}

/** Starting value for a goal. Assigned amount wins; else drop cash if excluded. */
export function goalStartingValue(input: {
  portfolioMv: number
  cashMv: number
  assignedAmount: number | null | undefined
  includeCash: boolean
}): number {
  if (input.assignedAmount != null) return Number(input.assignedAmount) || 0
  const book = Number(input.portfolioMv) || 0
  if (input.includeCash) return book
  return Math.max(0, book - (Number(input.cashMv) || 0))
}

export function fundingWarning(
  incomplete: Array<{ assignedAmount: number | null }>,
  portfolioMv: number
): FundingWarning | null {
  if (incomplete.length < 2) return null
  if (incomplete.some((g) => g.assignedAmount == null)) return 'full_mv_overlap'
  const sum = incomplete.reduce((s, g) => s + (Number(g.assignedAmount) || 0), 0)
  if (portfolioMv > 0 && sum > portfolioMv + 0.01) return 'assigned_exceeds_book'
  return null
}

export function goalStatus(input: {
  months: number | null
  plannedMonthly: number | null
  requiredMonthly: number | null
}): GoalStatus {
  if (input.months == null || input.plannedMonthly == null) return 'incomplete'
  if (input.requiredMonthly == null) return 'incomplete'
  if (input.plannedMonthly + ON_TRACK_EPS < input.requiredMonthly) return 'behind'
  if (input.plannedMonthly > input.requiredMonthly + ON_TRACK_EPS) return 'ahead'
  return 'on_track'
}

export function evaluateGoal(input: {
  pv: number
  target: number
  annualRate: number
  months: number | null
  plannedMonthly: number | null
}): GoalProjection {
  const pv = Number(input.pv) || 0
  const target = Number(input.target) || 0
  const annualRate = Number(input.annualRate) || 0
  const months = input.months
  const plannedMonthly =
    input.plannedMonthly == null ? null : Number(input.plannedMonthly) || 0

  let required: number | null = null
  let projected: number | null = null
  let monthsNeeded: number | null = null

  if (months != null && months >= 0) {
    required = requiredMonthly({ pv, target, annualRate, months })
    if (plannedMonthly != null) {
      projected = projectValue({
        pv,
        pmt: plannedMonthly,
        annualRate,
        months,
      })
    }
  }
  if (plannedMonthly != null) {
    monthsNeeded = monthsToTarget({
      pv,
      target,
      pmt: plannedMonthly,
      annualRate,
    })
  }

  return {
    pv,
    target,
    annualRate,
    months,
    plannedMonthly,
    requiredMonthly: required,
    projectedValue: projected,
    monthsToTarget: monthsNeeded,
    status: goalStatus({
      months,
      plannedMonthly,
      requiredMonthly: required,
    }),
  }
}

export type KeepContributing = {
  alreadyThere: boolean
  growthOnlyAtDate: number
  withPlannedAtDate: number
  surplusAtDate: number
  monthsWithPlanned: number | null
  monthsGrowthOnly: number | null
}

/** What keeping a planned PMT does when required monthly is already 0. */
export function keepContributingSurplus(input: {
  pv: number
  target: number
  annualRate: number
  months: number
  plannedMonthly: number
}): KeepContributing {
  const pv = Number(input.pv) || 0
  const target = Number(input.target) || 0
  const annualRate = Number(input.annualRate) || 0
  const months = Math.max(0, Math.floor(input.months))
  const plannedMonthly = Number(input.plannedMonthly) || 0
  const growthOnlyAtDate = projectValue({
    pv,
    pmt: 0,
    annualRate,
    months,
  })
  const withPlannedAtDate = projectValue({
    pv,
    pmt: plannedMonthly,
    annualRate,
    months,
  })
  return {
    alreadyThere: !(target > pv),
    growthOnlyAtDate,
    withPlannedAtDate,
    surplusAtDate: withPlannedAtDate - target,
    monthsWithPlanned: monthsToTarget({
      pv,
      target,
      pmt: plannedMonthly,
      annualRate,
    }),
    monthsGrowthOnly: monthsToTarget({
      pv,
      target,
      pmt: 0,
      annualRate,
    }),
  }
}

export function evaluateGoalFromDate(input: {
  pv: number
  target: number
  annualRate: number
  targetDate: string | null
  plannedMonthly: number | null
  now?: Date
}): GoalProjection {
  const months =
    input.targetDate && input.targetDate.length >= 10
      ? monthsUntil(input.targetDate, input.now)
      : null
  return evaluateGoal({
    pv: input.pv,
    target: input.target,
    annualRate: input.annualRate,
    months,
    plannedMonthly: input.plannedMonthly,
  })
}

/** Seed planned monthly from Settings contribution band. `none` → 0. */
export function seedMonthlyFromBand(
  band: MonthlyContribution | null | undefined
): number | null {
  if (!band) return null
  if (band === 'none') return 0
  if (band === '1_500') return 250
  if (band === '500_1000') return 750
  if (band === '1000_5000') return 3000
  if (band === '5000_plus') return 5000
  return null
}

/** Suggested target date from horizon band (form hint, not a silent write). */
export function suggestTargetDateFromHorizon(
  horizon: 'lt_3y' | '3_10y' | 'gt_10y' | null | undefined,
  now = new Date()
): string | null {
  const addMonths =
    horizon === 'lt_3y' ? 24 : horizon === '3_10y' ? 72 : horizon === 'gt_10y' ? 180 : null
  if (addMonths == null) return null
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() + addMonths
  const d = now.getUTCDate()
  const dt = new Date(Date.UTC(y, m, d))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}
