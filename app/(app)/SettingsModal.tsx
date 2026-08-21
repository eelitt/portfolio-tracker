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
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getInvestorProfile, updateInvestorProfile } from '@/app/actions/users'
import type {
  AgeBand,
  Horizon,
  InvestorProfileFields,
  MonthlyContribution,
  PreferredCurrency,
  RiskTolerance,
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
  const profileLocked = loadingProfile || savingProfile

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] shadow-xl rounded-xl border ring-0">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Dashboard layout, investor profile, and password.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Dashboard layout</h3>
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
          </section>

          <section className="space-y-2 border-t border-subtle pt-4">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              Investor profile
              {loadingProfile && (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                  aria-label="Loading investor profile"
                />
              )}
            </h3>
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
          </section>

          <section className="space-y-2 border-t border-subtle pt-4">
            <h3 className="text-sm font-medium">Change password</h3>
            <p className="text-xs text-muted-foreground">
              At least 8 characters. You will stay signed in.
            </p>
            <ChangePasswordForm resetToken={resetToken} />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
