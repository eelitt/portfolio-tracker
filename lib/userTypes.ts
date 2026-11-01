/**
 * Shared user/profile types and copy — safe for client and server imports.
 * No server-only modules here.
 */

export type PreferredCurrency = 'USD' | 'EUR'

export type AgeBand = 'under_30' | '30_45' | '45_60' | '60_plus'
export type Horizon = 'lt_3y' | '3_10y' | 'gt_10y'
export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive'
export type MonthlyContribution =
  | 'none'
  | '1_500'
  | '500_1000'
  | '1000_5000'
  | '5000_plus'

export interface InvestorProfileFields {
  ageBand: AgeBand | null
  horizon: Horizon | null
  riskTolerance: RiskTolerance | null
  monthlyContribution: MonthlyContribution | null
}

/** profiles.summary_label. The first summary card. */
export type SummaryLabel = 'total_market_value' | 'total_value'

export interface FuturesSettings {
  /** One pie slice per open side. Default on. */
  futuresInPie: boolean
  /** Drift and rebalance include a futures bucket. Default off. */
  futuresInPlan: boolean
  summaryLabel: SummaryLabel
}

export const DEFAULT_FUTURES_SETTINGS: FuturesSettings = {
  futuresInPie: true,
  futuresInPlan: false,
  summaryLabel: 'total_market_value',
}

export function summaryLabelText(label: SummaryLabel | null | undefined): string {
  return label === 'total_value' ? 'Total value' : 'Total Market Value'
}

export function futuresSettingsFromRow(row: {
  futures_in_pie?: boolean | null
  futures_in_plan?: boolean | null
  summary_label?: string | null
} | null): FuturesSettings {
  return {
    futuresInPie: row?.futures_in_pie !== false,
    futuresInPlan: row?.futures_in_plan === true,
    summaryLabel: row?.summary_label === 'total_value' ? 'total_value' : 'total_market_value',
  }
}

export interface UserProfile extends InvestorProfileFields, FuturesSettings {
  id: string
  email?: string
  preferredCurrency: PreferredCurrency
  admin: boolean
  accessToApp: boolean
}

/** Shown when login/session is blocked for missing app access. */
export const APP_ACCESS_DENIED_MESSAGE =
  'Your account does not have access to this app yet. An administrator must approve your account.'
