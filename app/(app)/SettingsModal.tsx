'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useDashboardLayout } from './dashboard/DashboardLayoutProvider'
import { ChangePasswordForm } from './ChangePasswordModal'
import type { DashboardLayoutMode } from '@/lib/dashboardLayout'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  getInvestorProfile,
  updateFuturesSettings,
  updateInvestorProfile,
} from '@/app/actions/users'
import {
  DEFAULT_FUTURES_SETTINGS,
  type AgeBand,
  type FuturesSettings,
  type Horizon,
  type InvestorProfileFields,
  type MonthlyContribution,
  type PreferredCurrency,
  type RiskTolerance,
  type SummaryLabel,
} from '@/lib/userTypes'
import {
  CONTRIBUTION_BANDS,
  formatContributionLabel,
} from '@/lib/allocationTargets'

const LAYOUTS: {
  id: DashboardLayoutMode
  title: string
  description: string
}[] = [
  {
    id: 'all',
    title: 'All sections',
    description: 'Summary, holdings, watchlist, and transactions on one page.',
  },
  {
    id: 'focus',
    title: 'Focus one section',
    description: 'Summary stays up top. Tabs switch holdings, watchlist, or transactions.',
  },
]

function selectValue<T extends string>(value: T | null | undefined): T | '' {
  return value ?? ''
}

function SectionHeader({
  title,
  open,
  onToggle,
  busy,
}: {
  title: string
  open: boolean
  onToggle: () => void
  busy?: boolean
}) {
  const Icon = open ? ChevronDown : ChevronRight
  return (
    <h3 className="text-sm font-medium">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
        onClick={onToggle}
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>{title}</span>
        {busy ? (
          <Loader2
            className="h-3.5 w-3.5 animate-spin text-muted-foreground"
            aria-label={`Loading ${title}`}
          />
        ) : null}
      </button>
    </h3>
  )
}

export default function SettingsModal({
  open,
  onOpenChange,
  preferredCurrency = 'USD',
  initialProfile,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  preferredCurrency?: PreferredCurrency
  initialProfile?: InvestorProfileFields
}) {
  const { layout, setLayout } = useDashboardLayout()
  const [resetToken, setResetToken] = useState(0)
  const [ageBand, setAgeBand] = useState<AgeBand | ''>(
    selectValue(initialProfile?.ageBand)
  )
  const [horizon, setHorizon] = useState<Horizon | ''>(
    selectValue(initialProfile?.horizon)
  )
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance | ''>(
    selectValue(initialProfile?.riskTolerance)
  )
  const [monthlyContribution, setMonthlyContribution] = useState<MonthlyContribution | ''>(
    selectValue(initialProfile?.monthlyContribution)
  )
  const [savingProfile, setSavingProfile] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [openLayout, setOpenLayout] = useState(false)
  const [openProfile, setOpenProfile] = useState(false)
  const [openPassword, setOpenPassword] = useState(false)
  const [openFutures, setOpenFutures] = useState(false)
  const [futuresInPie, setFuturesInPie] = useState(DEFAULT_FUTURES_SETTINGS.futuresInPie)
  const [futuresInPlan, setFuturesInPlan] = useState(DEFAULT_FUTURES_SETTINGS.futuresInPlan)
  const [summaryLabel, setSummaryLabel] = useState<SummaryLabel>(
    DEFAULT_FUTURES_SETTINGS.summaryLabel
  )
  const [savingFutures, setSavingFutures] = useState(false)
  const profileLocked = loadingProfile || savingProfile
  const futuresLocked = loadingProfile || savingFutures

  useEffect(() => {
    if (!open) setResetToken((n) => n + 1)
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingProfile(true)
    void (async () => {
      try {
        const r = await getInvestorProfile()
        if (cancelled) return
        if ('error' in r) {
          toast.error(r.error)
          return
        }
        setAgeBand(selectValue(r.data.ageBand))
        setHorizon(selectValue(r.data.horizon))
        setRiskTolerance(selectValue(r.data.riskTolerance))
        setMonthlyContribution(selectValue(r.data.monthlyContribution))
        setFuturesInPie(r.data.futuresInPie)
        setFuturesInPlan(r.data.futuresInPlan)
        setSummaryLabel(r.data.summaryLabel)
      } catch {
        if (!cancelled) toast.error('Could not load investor profile')
      } finally {
        if (!cancelled) setLoadingProfile(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  async function saveFutures(patch: Partial<FuturesSettings>) {
    const previous = { futuresInPie, futuresInPlan, summaryLabel }
    if (patch.futuresInPie !== undefined) setFuturesInPie(patch.futuresInPie)
    if (patch.futuresInPlan !== undefined) setFuturesInPlan(patch.futuresInPlan)
    if (patch.summaryLabel !== undefined) setSummaryLabel(patch.summaryLabel)
    setSavingFutures(true)
    const result = await updateFuturesSettings(patch)
    setSavingFutures(false)
    if ('error' in result) {
      setFuturesInPie(previous.futuresInPie)
      setFuturesInPlan(previous.futuresInPlan)
      setSummaryLabel(previous.summaryLabel)
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(40rem,calc(100vh-2rem))] overflow-y-auto sm:max-w-[480px] shadow-xl rounded-xl border ring-0">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Dashboard layout, investor profile, password, and futures.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="space-y-2">
            <SectionHeader
              title="Dashboard layout"
              open={openLayout}
              onToggle={() => setOpenLayout((open) => !open)}
            />
            {openLayout ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {LAYOUTS.map((opt) => {
                const selected = layout === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setLayout(opt.id)}
                    className={cn(
                      'rounded-xl border px-3 py-3 text-left transition-colors',
                      selected
                        ? 'border-gold bg-gold/10'
                        : 'border-subtle bg-surface-elevated hover:border-gold/50'
                    )}
                  >
                    <div className="text-sm font-medium">{opt.title}</div>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">
                      {opt.description}
                    </p>
                  </button>
                )
              })}
            </div>
            ) : null}
          </section>

          <section className="space-y-2 border-t border-subtle pt-4">
            <SectionHeader
              title="Investor profile"
              open={openProfile}
              onToggle={() => setOpenProfile((open) => !open)}
              busy={loadingProfile}
            />
            {openProfile ? (
            <>
            <p className="text-xs text-muted-foreground">
              Optional. Used to suggest a target mix and to ground assistant answers. Not a
              birthdate or income.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs">
                Age band
                <select
                  className="mt-1 w-full rounded border bg-background px-2 py-1.5 disabled:opacity-50"
                  value={ageBand}
                  disabled={profileLocked}
                  onChange={(e) => setAgeBand(e.target.value as AgeBand | '')}
                >
                  <option value="">Not set</option>
                  <option value="under_30">Under 30</option>
                  <option value="30_45">30–45</option>
                  <option value="45_60">45–60</option>
                  <option value="60_plus">60+</option>
                </select>
              </label>
              <label className="text-xs">
                Horizon
                <select
                  className="mt-1 w-full rounded border bg-background px-2 py-1.5 disabled:opacity-50"
                  value={horizon}
                  disabled={profileLocked}
                  onChange={(e) => setHorizon(e.target.value as Horizon | '')}
                >
                  <option value="">Not set</option>
                  <option value="lt_3y">Under 3 years</option>
                  <option value="3_10y">3–10 years</option>
                  <option value="gt_10y">Over 10 years</option>
                </select>
              </label>
              <label className="text-xs">
                Risk
                <select
                  className="mt-1 w-full rounded border bg-background px-2 py-1.5 disabled:opacity-50"
                  value={riskTolerance}
                  disabled={profileLocked}
                  onChange={(e) => setRiskTolerance(e.target.value as RiskTolerance | '')}
                >
                  <option value="">Not set</option>
                  <option value="conservative">Conservative</option>
                  <option value="moderate">Moderate</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </label>
              <label className="text-xs">
                Monthly contribution
                <select
                  className="mt-1 w-full rounded border bg-background px-2 py-1.5 disabled:opacity-50"
                  value={monthlyContribution}
                  disabled={profileLocked}
                  onChange={(e) =>
                    setMonthlyContribution(e.target.value as MonthlyContribution | '')
                  }
                >
                  <option value="">Not set</option>
                  {CONTRIBUTION_BANDS.map((band) => (
                    <option key={band} value={band}>
                      {formatContributionLabel(band, preferredCurrency)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Button
              size="sm"
              disabled={profileLocked}
              onClick={async () => {
                setSavingProfile(true)
                const r = await updateInvestorProfile({
                  ageBand: ageBand || null,
                  horizon: horizon || null,
                  riskTolerance: riskTolerance || null,
                  monthlyContribution: monthlyContribution || null,
                })
                setSavingProfile(false)
                if ('error' in r) toast.error(r.error)
                else toast.success('Investor profile saved')
              }}
            >
              Save profile
            </Button>
            </>
            ) : null}
          </section>

          <section className="space-y-2 border-t border-subtle pt-4">
            <SectionHeader
              title="Change password"
              open={openPassword}
              onToggle={() => setOpenPassword((open) => !open)}
            />
            {openPassword ? (
              <>
                <p className="text-xs text-muted-foreground">
                  At least 8 characters. You will stay signed in.
                </p>
                <ChangePasswordForm resetToken={resetToken} />
              </>
            ) : null}
          </section>

          <section className="space-y-2 border-t border-subtle pt-4">
            <SectionHeader
              title="Futures"
              open={openFutures}
              onToggle={() => setOpenFutures((open) => !open)}
              busy={loadingProfile}
            />
            {openFutures ? (
              <div className="space-y-3">
                <label className="block text-xs">
                  Summary name
                  <select
                    className="mt-1 w-full rounded border bg-background px-2 py-1.5 disabled:opacity-50"
                    value={summaryLabel}
                    disabled={futuresLocked}
                    onChange={(e) => {
                      const next = e.target.value as SummaryLabel
                      if (next === summaryLabel) return
                      void saveFutures({ summaryLabel: next })
                    }}
                  >
                    <option value="total_market_value">Total Market Value</option>
                    <option value="total_value">Total value</option>
                  </select>
                </label>
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={futuresInPie}
                    disabled={futuresLocked}
                    onChange={(e) => void saveFutures({ futuresInPie: e.target.checked })}
                  />
                  <span>Pie includes each open side, sized by equity.</span>
                </label>
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={futuresInPlan}
                    disabled={futuresLocked}
                    onChange={(e) => void saveFutures({ futuresInPlan: e.target.checked })}
                  />
                  <span>
                    Plan counts futures as their own bucket. The target starts at 0, and suggestions
                    do not buy or sell the coin because of that bucket.
                  </span>
                </label>
              </div>
            ) : null}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
