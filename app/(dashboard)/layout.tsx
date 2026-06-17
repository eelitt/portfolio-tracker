import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Navbar from './Navbar'
import { Toaster } from 'sonner'

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

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <main className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>
      <Toaster position="top-right" richColors closeButton />
    </div>
  )
}