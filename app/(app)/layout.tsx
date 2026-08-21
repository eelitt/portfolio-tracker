import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Navbar from './Navbar'
import SiteFooter from './SiteFooter'
import PlanSidebarHost from './plan/PlanSidebarHost'
import AIInsightsPanel from './ai-insights/AIInsightsPanel'
import { Suspense } from 'react'
import { getCurrentUserProfile } from '@/lib/user'
import { PrivacyModeProvider } from './privacy/PrivacyModeProvider'
import { DashboardLayoutProvider } from './dashboard/DashboardLayoutProvider'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const profile = await getCurrentUserProfile()
  if (!profile?.accessToApp) {
    await supabase.auth.signOut()
    redirect('/login?reason=access')
  }

  const hasAiKey = !!process.env.XAI_API_KEY

  return (
    <PrivacyModeProvider>
      <DashboardLayoutProvider>
      <div className="flex min-h-screen flex-col bg-transparent">
        <Navbar
          user={user}
          hasAiKey={hasAiKey}
          preferredCurrency={profile?.preferredCurrency || 'USD'}
          isAdmin={profile?.admin === true}
          investorProfile={{
            ageBand: profile.ageBand ?? null,
            horizon: profile.horizon ?? null,
            riskTolerance: profile.riskTolerance ?? null,
            monthlyContribution: profile.monthlyContribution ?? null,
          }}
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
          {children}
        </main>
        <SiteFooter />
        <Suspense fallback={null}>
          <PlanSidebarHost
            preferredCurrency={profile?.preferredCurrency || 'USD'}
            canSuggestMix={Boolean(profile?.riskTolerance && profile?.horizon)}
            contributionBand={profile?.monthlyContribution ?? null}
            horizon={profile?.horizon ?? null}
          />
        </Suspense>
        <AIInsightsPanel isAdmin={profile?.admin === true} />
      </div>
      </DashboardLayoutProvider>
    </PrivacyModeProvider>
  )
}
