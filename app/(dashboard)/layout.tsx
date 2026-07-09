import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Navbar from './Navbar'
import GoalsSidebar from './dashboard/GoalsSidebar'
import AIInsightsPanel from './dashboard/AIInsightsPanel'
import { Toaster } from 'sonner'
import { getCurrentUserProfile } from '@/app/actions/users'

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
  const hasAiKey = !!process.env.XAI_API_KEY

  return (
    <div className="min-h-screen bg-muted dark:bg-background">
      <Navbar 
        user={user} 
        hasAiKey={hasAiKey} 
        preferredCurrency={profile?.preferredCurrency || 'USD'} 
      />
      <main className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>
      <Toaster position="top-right" richColors closeButton />
      <GoalsSidebar />
      <AIInsightsPanel />
    </div>
  )
}