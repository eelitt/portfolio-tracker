'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getCurrentUserProfile } from '@/lib/user'
import { allocationPolicySchema } from '@/lib/schemas'
import { getPortfolioData } from '@/lib/portfolioData'
import { resolveCatalogSymbol } from '@/lib/portfolioAnalyst'
import {
  computeDrift,
  suggestMixFromProfile,
  suggestRebalance,
  validatePolicySpec,
  type AllocationPolicySpec,
  type RebalanceMode,
} from '@/lib/allocationTargets'

export type SavedAllocationPolicy = AllocationPolicySpec

function emptySpec(): AllocationPolicySpec {
  return {
    typeWeights: { stock: 0, etf: 0, crypto: 0, cash: 0 },
    symbolOverrides: [],
    tolerancePp: 5,
  }
}

export async function getAllocationPolicy(): Promise<
  { data: SavedAllocationPolicy | null; error?: string }
> {
  const user = await getCurrentUser()
  if (!user) return { data: null, error: 'Not authenticated' }

  const supabase = await createClient()
  const { data: policy, error } = await supabase
    .from('allocation_policies')
    .select('id, tolerance_pp')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  if (!policy) return { data: null }

  const { data: rows, error: tErr } = await supabase
    .from('allocation_targets')
    .select('scope, key, weight_percent')
    .eq('policy_id', policy.id)

  if (tErr) return { data: null, error: tErr.message }

  const typeWeights = { stock: 0, etf: 0, crypto: 0, cash: 0 }
  const symbolOverrides: SavedAllocationPolicy['symbolOverrides'] = []
  for (const r of rows ?? []) {
    const w = Number(r.weight_percent)
    if (r.scope === 'asset_type' && r.key in typeWeights) {
      typeWeights[r.key as keyof typeof typeWeights] = w
    } else if (r.scope === 'symbol') {
      const cat = resolveCatalogSymbol(String(r.key))
      const assetType =
        cat && 'assetType' in cat && cat.assetType !== 'cash' ? cat.assetType : 'stock'
      symbolOverrides.push({
        symbol: String(r.key).toUpperCase(),
        assetType,
        weightPercent: w,
      })
    }
  }

  return {
    data: {
      typeWeights,
      symbolOverrides,
      tolerancePp: Number(policy.tolerance_pp) || 5,
    },
  }
}

export async function upsertAllocationPolicy(input: unknown): Promise<
  { success: true; data: SavedAllocationPolicy } | { error: string }
> {
  const parsed = allocationPolicySchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid allocation policy' }
  }

  const checked = validatePolicySpec(parsed.data)
  if (!checked.ok) return { error: checked.error }

  for (const o of checked.spec.symbolOverrides) {
    const cat = resolveCatalogSymbol(o.symbol, o.assetType)
    if (!cat || 'error' in cat) {
      return { error: `${o.symbol} is not in the catalog.` }
    }
    if (cat.assetType !== o.assetType) {
      return { error: `${o.symbol} is a ${cat.assetType}, not ${o.assetType}.` }
    }
  }

  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { data: policy, error: pErr } = await supabase
    .from('allocation_policies')
    .upsert(
      {
        user_id: user.id,
        tolerance_pp: checked.spec.tolerancePp,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('id')
    .single()

  if (pErr || !policy) return { error: pErr?.message ?? 'Failed to save policy' }

  const { error: delErr } = await supabase
    .from('allocation_targets')
    .delete()
    .eq('policy_id', policy.id)
  if (delErr) return { error: delErr.message }

  const rows = [
    ...(['stock', 'etf', 'crypto', 'cash'] as const).map((key) => ({
      user_id: user.id,
      policy_id: policy.id,
      scope: 'asset_type' as const,
      key,
      weight_percent: checked.spec.typeWeights[key],
    })),
    ...checked.spec.symbolOverrides.map((o) => ({
      user_id: user.id,
      policy_id: policy.id,
      scope: 'symbol' as const,
      key: o.symbol,
      weight_percent: o.weightPercent,
    })),
  ]

  const { error: insErr } = await supabase.from('allocation_targets').insert(rows)
  if (insErr) return { error: insErr.message }

  revalidatePath('/dashboard')
  return { success: true, data: checked.spec }
}

export async function getAllocationWorkspace(opts?: {
  mode?: RebalanceMode
  cashIn?: number
}): Promise<
  | {
      data: {
        policy: SavedAllocationPolicy | null
        totalMarketValue: number
        preferredCurrency: 'USD' | 'EUR'
        unpricedSymbols: string[]
        byType: ReturnType<typeof computeDrift>['byType']
        bySymbol: ReturnType<typeof computeDrift>['bySymbol']
        suggestions: ReturnType<typeof suggestRebalance>['suggestions']
        notes: string[]
      }
    }
  | { error: string }
> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const [policyRes, portfolio] = await Promise.all([
    getAllocationPolicy(),
    getPortfolioData(),
  ])
  if (policyRes.error) return { error: policyRes.error }
  if (portfolio.error) {
    return { error: portfolio.error }
  }

  const policy = policyRes.data
  const spec = policy ?? emptySpec()
  const drift = policy
    ? computeDrift(portfolio.enrichedHoldings, spec)
    : {
        totalMarketValue: portfolio.totalMarketValue,
        unpricedSymbols: portfolio.unpricedSymbols,
        byType: [],
        bySymbol: [],
      }
  const plan = policy
    ? suggestRebalance(portfolio.enrichedHoldings, spec, {
        mode: opts?.mode ?? 'inplace',
        cashIn: opts?.cashIn,
      })
    : { suggestions: [], notes: [] }

  return {
    data: {
      policy,
      totalMarketValue: drift.totalMarketValue,
      preferredCurrency: portfolio.preferredCurrency,
      unpricedSymbols: drift.unpricedSymbols,
      byType: drift.byType,
      bySymbol: drift.bySymbol,
      suggestions: plan.suggestions,
      notes: plan.notes,
    },
  }
}

export async function previewMixFromProfile() {
  const profile = await getCurrentUserProfile()
  if (!profile) return { error: 'Not authenticated' as const }
  return {
    data: suggestMixFromProfile({
      ageBand: profile.ageBand,
      horizon: profile.horizon,
      riskTolerance: profile.riskTolerance,
      monthlyContribution: profile.monthlyContribution,
    }),
  }
}
