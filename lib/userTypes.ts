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

export interface UserProfile extends InvestorProfileFields {
  id: string
  email?: string
  preferredCurrency: PreferredCurrency
  admin: boolean
  accessToApp: boolean
}

/** Shown when login/session is blocked for missing app access. */
export const APP_ACCESS_DENIED_MESSAGE =
  'Your account does not have access to this app yet. An administrator must approve your account.'
