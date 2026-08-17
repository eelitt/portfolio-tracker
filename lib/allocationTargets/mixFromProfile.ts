import type {
  Horizon,
  InvestorProfile,
  RiskTolerance,
  TypeWeightMap,
} from './types'
import { emptyTypeWeights } from './validate'

export type MixSuggestion =
  | {
      ok: true
      typeWeights: TypeWeightMap
      templateId: string
      notes: string[]
    }
  | { ok: false; missing: Array<'riskTolerance' | 'horizon'>; notes: string[] }

const BASE: Record<RiskTolerance, Record<Horizon, TypeWeightMap>> = {
  conservative: {
    lt_3y: { stock: 25, etf: 25, crypto: 5, cash: 45 },
    '3_10y': { stock: 35, etf: 30, crypto: 10, cash: 25 },
    gt_10y: { stock: 40, etf: 35, crypto: 10, cash: 15 },
  },
  moderate: {
    lt_3y: { stock: 30, etf: 25, crypto: 15, cash: 30 },
    '3_10y': { stock: 35, etf: 30, crypto: 20, cash: 15 },
    gt_10y: { stock: 35, etf: 30, crypto: 25, cash: 10 },
  },
  aggressive: {
    lt_3y: { stock: 30, etf: 25, crypto: 25, cash: 20 },
    '3_10y': { stock: 30, etf: 25, crypto: 35, cash: 10 },
    gt_10y: { stock: 30, etf: 25, crypto: 40, cash: 5 },
  },
}

function shift(mix: TypeWeightMap, from: keyof TypeWeightMap, to: keyof TypeWeightMap, pp: number) {
  const take = Math.min(pp, mix[from])
  mix[from] -= take
  mix[to] += take
}

/**
 * Deterministic type mix from investor profile enums.
 * Requires risk + horizon. Age and contribution only tilt / annotate.
 */
export function suggestMixFromProfile(profile: InvestorProfile): MixSuggestion {
  const missing: Array<'riskTolerance' | 'horizon'> = []
  if (!profile.riskTolerance) missing.push('riskTolerance')
  if (!profile.horizon) missing.push('horizon')
  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      notes: ['Set risk tolerance and time horizon in Settings to suggest a mix.'],
    }
  }

  const risk = profile.riskTolerance!
  const horizon = profile.horizon!
  const mix = { ...BASE[risk][horizon] }
  const notes: string[] = [
    `Template ${risk} / ${horizon.replace('_', '–')}.`,
  ]

  if (profile.ageBand === '60_plus') {
    shift(mix, 'crypto', 'cash', 10)
    notes.push('Age 60+: shifted 10pp from crypto into cash.')
  } else if (profile.ageBand === 'under_30') {
    shift(mix, 'cash', 'crypto', 5)
    notes.push('Under 30: shifted 5pp from cash into crypto.')
  }

  if (
    (profile.monthlyContribution === '1000_5000' ||
      profile.monthlyContribution === '5000_plus') &&
    mix.cash < 15
  ) {
    shift(mix, 'crypto', 'cash', 5)
    notes.push('Larger monthly contributions: kept a bit more cash.')
  }

  return {
    ok: true,
    typeWeights: mix,
    templateId: `${risk}_${horizon}`,
    notes,
  }
}

export function defaultEmptyMix(): TypeWeightMap {
  return emptyTypeWeights()
}
