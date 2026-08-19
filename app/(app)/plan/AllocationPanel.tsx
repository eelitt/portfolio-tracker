'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionIconPopover } from '@/components/ui/section-icon-popover'
import { SegmentedControl } from '@/app/(app)/dashboard/holdings/SegmentedControl'
import SensitiveValue from '@/components/SensitiveValue'
import { formatCurrency } from '@/lib/currency'
import type { PreferredCurrency } from '@/lib/userTypes'
import {
  getAllocationWorkspace,
  previewMixFromProfile,
  upsertAllocationPolicy,
  type AllocationWorkspaceData,
} from '@/app/actions/allocation'
import { ALLOC_ASSET_TYPES, type TypeWeightMap } from '@/lib/allocationTargets'
import type { DriftRow, RebalanceSuggestion } from '@/lib/allocationTargets'
import { resolveCatalogSymbol } from '@/lib/portfolioAnalyst'

const TYPE_LABEL: Record<string, string> = {
  stock: 'Stock',
  etf: 'ETF',
  crypto: 'Crypto',
  cash: 'Cash',
}

const DEFAULT_TYPE_WEIGHTS: TypeWeightMap = {
  stock: 40,
  etf: 20,
  crypto: 20,
  cash: 20,
}

export default function AllocationPanel({
  preferredCurrency,
  initialWorkspace,
  initialCanSuggestMix = false,
  initialCashPrefill,
}: {
  preferredCurrency: PreferredCurrency
  initialWorkspace?: AllocationWorkspaceData
  initialCanSuggestMix?: boolean
  initialCashPrefill?: number
}) {
  const [typeWeights, setTypeWeights] = useState<TypeWeightMap>(
    initialWorkspace?.policy?.typeWeights ?? DEFAULT_TYPE_WEIGHTS
  )
  const [tolerancePp, setTolerancePp] = useState(
    initialWorkspace?.policy?.tolerancePp ?? 5
  )
  const [symbolRows, setSymbolRows] = useState<
    Array<{ symbol: string; assetType: 'stock' | 'etf' | 'crypto'; weightPercent: number }>
  >(initialWorkspace?.policy?.symbolOverrides ?? [])
  const [hasPolicy, setHasPolicy] = useState(Boolean(initialWorkspace?.policy))
  const [byType, setByType] = useState<DriftRow[]>(initialWorkspace?.byType ?? [])
  const [bySymbol, setBySymbol] = useState<DriftRow[]>(
    initialWorkspace?.bySymbol ?? []
  )
  const [suggestions, setSuggestions] = useState<RebalanceSuggestion[]>(
    initialWorkspace?.suggestions ?? []
  )
  const [notes, setNotes] = useState<string[]>(initialWorkspace?.notes ?? [])
  const [totalMv, setTotalMv] = useState(initialWorkspace?.totalMarketValue ?? 0)
  const [unpriced, setUnpriced] = useState<string[]>(
    initialWorkspace?.unpricedSymbols ?? []
  )
  const [mode, setMode] = useState<'inplace' | 'new_cash'>('inplace')
  const [cashIn, setCashIn] = useState(
    initialCashPrefill != null && Number.isFinite(initialCashPrefill)
      ? String(Math.round(initialCashPrefill * 100) / 100)
      : ''
  )
  const [mixPreview, setMixPreview] = useState<TypeWeightMap | null>(null)
  const [mixNotes, setMixNotes] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [newSymbol, setNewSymbol] = useState('')
  const [newSymPct, setNewSymPct] = useState('5')
  const canSuggestMix = initialCanSuggestMix

  const typeSum = ALLOC_ASSET_TYPES.reduce((s, t) => s + Number(typeWeights[t] || 0), 0)

  const load = useCallback(async (cashOverride?: number) => {
    const ws = await getAllocationWorkspace({
      mode,
      cashIn: mode === 'new_cash' ? (cashOverride ?? (Number(cashIn) || 0)) : undefined,
    })
    if ('error' in ws) {
      toast.error(ws.error)
      return
    }
    setTotalMv(ws.data.totalMarketValue)
    setUnpriced(ws.data.unpricedSymbols)
    setByType(ws.data.byType)
    setBySymbol(ws.data.bySymbol)
    setSuggestions(ws.data.suggestions)
    setNotes(ws.data.notes)
    if (ws.data.policy) {
      setHasPolicy(true)
      setTypeWeights(ws.data.policy.typeWeights)
      setTolerancePp(ws.data.policy.tolerancePp)
      setSymbolRows(ws.data.policy.symbolOverrides)
    }
  }, [mode, cashIn])

  useEffect(() => {
    // In-place workspace is hydrated from the dashboard GET. Refetch only
    // when the user switches rebalance mode (or after save / cash blur).
    if (mode === 'inplace' && initialWorkspace) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const save = async (weights = typeWeights, symbols = symbolRows, tol = tolerancePp) => {
    setSaving(true)
    const result = await upsertAllocationPolicy({
      typeWeights: weights,
      symbolOverrides: symbols,
      tolerancePp: tol,
    })
    setSaving(false)
    if ('error' in result) {
      toast.error(result.error)
      return
    }
    toast.success('Allocation targets saved')
    setMixPreview(null)
    await load()
  }

  const addSymbol = () => {
    const resolved = resolveCatalogSymbol(newSymbol.trim())
    if (!resolved || 'error' in resolved || resolved.assetType === 'cash') {
      toast.error('Unknown catalog ticker')
      return
    }
    const pct = Number(newSymPct)
    if (!(pct >= 0) || pct > 100) {
      toast.error('Weight must be 0–100')
      return
    }
    if (symbolRows.some((r) => r.symbol === resolved.symbol)) {
      toast.error('That symbol is already an override')
      return
    }
    setSymbolRows([
      ...symbolRows,
      {
        symbol: resolved.symbol,
        assetType: resolved.assetType as 'stock' | 'etf' | 'crypto',
        weightPercent: pct,
      },
    ])
    setNewSymbol('')
  }

  const suggestMix = async () => {
    const r = await previewMixFromProfile()
    if ('error' in r) {
      toast.error(r.error)
      return
    }
    if (!r.data.ok) {
      toast.error(r.data.notes[0] ?? 'Complete your investor profile in Settings')
      return
    }
    setMixPreview(r.data.typeWeights)
    setMixNotes(r.data.notes)
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Book{' '}
          <SensitiveValue value={formatCurrency(totalMv, preferredCurrency, 1)} />
          {unpriced.length > 0 && (
            <span> · Unpriced: {unpriced.join(', ')}</span>
          )}
        </p>
        <SectionIconPopover
          label="How allocation works"
          title="How allocation works"
          icon={<CircleHelp className="h-4 w-4" />}
          className="shrink-0"
          panelClassName="right-0 left-auto w-[min(18.5rem,calc(100vw-2rem))] sm:w-[min(18.5rem,calc(100vw-2rem))]"
        >
          <ul className="list-disc space-y-2 pl-4 text-xs leading-relaxed text-muted-foreground">
            <li>Type targets must sum to 100%. Drift uses priced holdings and cash only.</li>
            <li>Tolerance (pp) hides drift smaller than that band.</li>
            <li>Symbol overrides are % of the whole book and cannot exceed that type’s bucket.</li>
            <li>In place spends extra cash first, then suggests sells. New cash only allocates an inflow.</li>
            <li>Suggestions are estimates, not logged trades.</li>
            <li>Suggest from profile appears only when risk and time horizon are set in Settings.</li>
          </ul>
        </SectionIconPopover>
      </div>

      <div className="space-y-2 rounded-lg border border-subtle bg-card p-3">
        <div className="text-xs font-medium">Target mix</div>
        {ALLOC_ASSET_TYPES.map((t) => {
          const drift = byType.find((d) => d.key === t)
          return (
            <div key={t} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2">
              <label className="text-xs text-muted-foreground">{TYPE_LABEL[t]}</label>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={typeWeights[t]}
                onChange={(e) =>
                  setTypeWeights({ ...typeWeights, [t]: Number(e.target.value) })
                }
                className="w-full rounded border bg-background px-2 py-1"
              />
              <span className="w-24 text-right text-[11px] text-muted-foreground">
                {drift
                  ? `${drift.actualPercent.toFixed(0)}% · ${drift.status === 'ok' ? 'ok' : drift.deltaPp > 0 ? '+' : ''}${drift.deltaPp.toFixed(0)}pp`
                  : '—'}
              </span>
            </div>
          )
        })}
        <p className={`text-[11px] ${Math.abs(typeSum - 100) < 0.05 ? 'text-muted-foreground' : 'text-destructive'}`}>
          Type weights: {typeSum.toFixed(0)}% (need 100%)
        </p>
      </div>

      <div className="rounded-lg border border-subtle bg-card p-3">
        <div className="mb-1 text-xs font-medium">Symbol overrides (optional)</div>
        {symbolRows.map((row, i) => {
          const drift = bySymbol.find((d) => d.key === row.symbol)
          return (
            <div key={row.symbol} className="mb-1 flex items-center gap-2 text-xs">
              <span className="w-16 font-medium">{row.symbol}</span>
              <input
                type="number"
                className="w-16 rounded border bg-background px-1 py-0.5"
                value={row.weightPercent}
                onChange={(e) => {
                  const next = [...symbolRows]
                  next[i] = { ...row, weightPercent: Number(e.target.value) }
                  setSymbolRows(next)
                }}
              />
              <span className="text-muted-foreground">
                {drift ? `${drift.actualPercent.toFixed(0)}% now` : ''}
              </span>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setSymbolRows(symbolRows.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          )
        })}
        <div className="mt-1 flex gap-1">
          <input
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            placeholder="BTC"
            className="w-20 rounded border bg-background px-2 py-1 text-xs"
          />
          <input
            value={newSymPct}
            onChange={(e) => setNewSymPct(e.target.value)}
            type="number"
            className="w-14 rounded border bg-background px-2 py-1 text-xs"
          />
          <Button type="button" size="sm" variant="outline" onClick={addSymbol}>
            Add
          </Button>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs">
        Tolerance
        <input
          type="number"
          min={0}
          max={50}
          value={tolerancePp}
          onChange={(e) => setTolerancePp(Number(e.target.value))}
          className="w-16 rounded border bg-background px-2 py-1"
        />
        pp
      </label>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={saving} onClick={() => void save()}>
          Save targets
        </Button>
        {canSuggestMix ? (
          <Button size="sm" variant="outline" onClick={() => void suggestMix()}>
            Suggest from profile
          </Button>
        ) : (
          <p className="self-center text-[11px] text-muted-foreground">
            Set risk and time horizon in Settings to suggest a mix.
          </p>
        )}
      </div>

      {mixPreview && (
        <div className="rounded-lg border border-gold/40 bg-gold/5 p-2 text-xs">
          <div className="font-medium">Suggested mix</div>
          <p className="mt-1 text-muted-foreground">
            {ALLOC_ASSET_TYPES.map((t) => `${TYPE_LABEL[t]} ${mixPreview[t]}%`).join(' · ')}
          </p>
          {mixNotes.map((n) => (
            <p key={n} className="mt-0.5 text-muted-foreground">
              {n}
            </p>
          ))}
          <Button
            size="sm"
            className="mt-2"
            onClick={() => void save(mixPreview, symbolRows, tolerancePp)}
          >
            Use this mix
          </Button>
        </div>
      )}

      {hasPolicy && (
        <div className="space-y-3 rounded-lg border border-subtle bg-card p-3">
          <div className="text-xs font-medium">Rebalance</div>
          <SegmentedControl
            aria-label="Rebalance mode"
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'inplace', label: 'In place' },
              { value: 'new_cash', label: 'New cash' },
            ]}
          />
          {mode === 'new_cash' && (
            <input
              type="number"
              min={0}
              value={cashIn}
              onChange={(e) => setCashIn(e.target.value)}
              onBlur={() => void load(Number(cashIn) || 0)}
              placeholder="Amount to invest"
              className="w-full rounded border bg-background px-2 py-1"
            />
          )}

          <div>
            <div className="mb-1 text-xs font-medium">Suggestions</div>
            {suggestions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {hasPolicy ? 'Within tolerance, or save targets first.' : 'Save a mix to see drift.'}
              </p>
            ) : (
              <ul className="space-y-1 text-xs">
                {suggestions.map((s, i) => (
                  <li key={`${s.side}-${s.key}-${i}`}>
                    <span className="font-medium capitalize">{s.side}</span>{' '}
                    <SensitiveValue
                      value={formatCurrency(s.notional, preferredCurrency, 1)}
                    />{' '}
                    of {s.key}
                    <span className="block text-muted-foreground">{s.reason}</span>
                  </li>
                ))}
              </ul>
            )}
            {notes.map((n) => (
              <p key={n} className="mt-1 text-[11px] text-muted-foreground">
                {n}
              </p>
            ))}
            <p className="mt-2 text-[10px] text-muted-foreground">
              Estimate only — not advice. Suggestions are not logged as trades.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
