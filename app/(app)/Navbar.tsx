'use client'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { LogOut, Settings, Sun, Moon, Target, Sparkles, DollarSign, Euro, Download, Upload, Eye, EyeOff, Calculator, Orbit} from 'lucide-react'
import { usePrivacyMode } from './privacy/PrivacyModeProvider'
import AiUsageMenu from './AiUsageMenu'
import ImportTransactionsModal from './dashboard/transactions/ImportTransactionsModal'
import SettingsModal from './SettingsModal'
import TaxEstimatorModal from './tax/TaxEstimatorModal'
import AdminMenu from './admin/AdminMenu'
import { getTransactionsForExport, getHoldingsForExport } from '@/app/actions/transactions'
import { exportTransactionsToCsv, exportHoldingsToCsv } from '@/lib/exportToCsv'
import { useState, useEffect } from 'react'
import { updatePreferredCurrency } from '@/app/actions/users'
import type { InvestorProfileFields, PreferredCurrency } from '@/lib/userTypes'

interface NavbarProps {
  user: any
  hasAiKey?: boolean
  preferredCurrency?: PreferredCurrency
  isAdmin?: boolean
  investorProfile?: InvestorProfileFields
}

export default function Navbar({
  user,
  hasAiKey = true,
  preferredCurrency = 'USD',
  isAdmin = false,
  investorProfile,
}: NavbarProps) {
  const router = useRouter()
  const supabase = createClient()
  const { hideMoney, toggleHideMoney } = usePrivacyMode()

  // Dark is product default; localStorage 'light' opts out.
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')

  useEffect(() => {
    const stored = localStorage.getItem('theme') as 'light' | 'dark' | null
    const initial = stored === 'light' ? 'light' : 'dark'

    setTheme(initial)
    if (initial === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)

    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  const togglePlanSidebar = () => {
    const stored = localStorage.getItem('planSidebarOpen')
    const currentlyOpen =
      stored !== null
        ? stored === 'true'
        : localStorage.getItem('goalsSidebarOpen') === 'true'
    const newOpen = !currentlyOpen
    localStorage.setItem('planSidebarOpen', newOpen.toString())
    window.dispatchEvent(new CustomEvent('plan-sidebar-toggle'))
  }

  const toggleAIInsights = () => {
    const currentlyOpen = localStorage.getItem('aiInsightsSidebarOpen') === 'true'
    const newOpen = !currentlyOpen
    localStorage.setItem('aiInsightsSidebarOpen', newOpen.toString())
    window.dispatchEvent(new CustomEvent('ai-insights-toggle'))
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const [planOpen, setPlanOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [currentCurrency, setCurrentCurrency] = useState<PreferredCurrency>(
    preferredCurrency || 'USD'
  )
  const [accountOpen, setAccountOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [taxEstimatorOpen, setTaxEstimatorOpen] = useState(false)

  useEffect(() => {
    const readPlan = () => {
      const stored = localStorage.getItem('planSidebarOpen')
      setPlanOpen(
        stored !== null
          ? stored === 'true'
          : localStorage.getItem('goalsSidebarOpen') === 'true'
      )
    }
    const readAssistant = () => {
      setAssistantOpen(localStorage.getItem('aiInsightsSidebarOpen') === 'true')
    }

    readPlan()
    readAssistant()
    window.addEventListener('plan-sidebar-toggle', readPlan)
    window.addEventListener('goals-sidebar-toggle', readPlan)
    window.addEventListener('ai-insights-toggle', readAssistant)
    return () => {
      window.removeEventListener('plan-sidebar-toggle', readPlan)
      window.removeEventListener('goals-sidebar-toggle', readPlan)
      window.removeEventListener('ai-insights-toggle', readAssistant)
    }
  }, [])

  // Sync local state when the server prop changes (e.g. after refresh or currency update)
  useEffect(() => {
    if (preferredCurrency) {
      setCurrentCurrency(preferredCurrency)
    }
  }, [preferredCurrency])

  const handleCurrencyChange = async (newCurrency: PreferredCurrency) => {
    if (newCurrency === currentCurrency) return

    setCurrentCurrency(newCurrency)
    await updatePreferredCurrency(newCurrency)
    // Notify sidebars (goals etc.) to reload values in new currency
    window.dispatchEvent(new CustomEvent('portfolio-updated'))
    // Refresh to re-fetch server components with new currency
    router.refresh()
  }

  const handleExportTransactions = async () => {
    const txs = await getTransactionsForExport()
    exportTransactionsToCsv(txs)
  }

  const handleExportHoldings = async () => {
    const holdings = await getHoldingsForExport()
    exportHoldingsToCsv(holdings)
  }

  const handleImportCsv = () => {
    window.dispatchEvent(new CustomEvent('open-csv-import'))
  }

  const userInitials = user?.email?.[0]?.toUpperCase() || 'U'
  const userName = user?.email?.split('@')[0] || 'User'

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/80 shadow-md backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        {/* Brand: Portfolio (gold) + Tracker (white/foreground) */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight"
        >
          <img
            src="/brand/portfolio-tracker-icon.svg"
            alt="Portfolio Tracker"
            width={32}
            height={32}
            className="h-8 w-8"
          />
          <span>
            <span className="text-gold">Portfolio</span>{' '}
            <span className="text-foreground">Tracker</span>
          </span>
        </Link>

        <div className="flex items-center gap-8 text-sm font-medium">
          <Link
            href="/dashboard"
            className="text-foreground/90 transition-colors hover:text-gold"
          >
            Dashboard
          </Link>
        </div>

        {/* Right side: Theme toggle + User menu */}
        <div className="flex items-center gap-2">
          {/* Clean theme toggle button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="group h-9 w-9"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 transition-transform duration-200 ease-out group-hover:scale-110 group-hover:text-gold group-active:scale-95 motion-reduce:transform-none" />
            ) : (
              <Moon className="h-4 w-4 transition-transform duration-200 ease-out group-hover:scale-110 group-hover:text-gold group-active:scale-95 motion-reduce:transform-none" />
            )}
          </Button>

          {/* Admin tools — dropdown + modals (admins only) */}
          {isAdmin && user?.id && <AdminMenu currentUserId={user.id} />}

          {/* Multi-agent chat assistant */}
          {hasAiKey && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleAIInsights}
              className={`group flex items-center gap-2 ${assistantOpen ? 'border-gold' : ''}`}
              aria-expanded={assistantOpen}
              aria-label="Toggle assistant chat"
              title="Assistant"
            >
              <Orbit className="h-4 w-4 transition-transform duration-200 ease-out group-hover:scale-110 group-hover:text-gold group-active:scale-95 motion-reduce:transform-none" />
              Assistant
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={togglePlanSidebar}
            className={`group flex items-center gap-2 ${planOpen ? 'border-gold' : ''}`}
            aria-expanded={planOpen}
            aria-label="Toggle plan sidebar"
          >
            <Target className="h-4 w-4 transition-transform duration-200 ease-out group-hover:scale-110 group-hover:text-gold group-active:scale-95 motion-reduce:transform-none" />
            Plan
          </Button>

          {/* User Dropdown */}
          <DropdownMenu onOpenChange={setAccountOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="group flex h-9 items-center gap-2 px-2 hover:bg-accent data-[state=open]:border-gold">
                <Avatar className="h-8 w-8 transition-transform duration-200 ease-out after:border-gold after:mix-blend-normal group-hover:scale-110 group-data-[state=open]:scale-110 motion-reduce:transform-none dark:after:mix-blend-normal">
                  <AvatarFallback className="bg-accent text-sm text-accent-foreground">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden pr-1 font-display text-base tracking-tight transition-colors group-hover:text-gold group-data-[state=open]:text-gold md:block">
                  {userName}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-72 shadow-lg rounded-md border">
              <div className="px-3 py-2 text-sm text-muted-foreground truncate">
                {user?.email}
              </div>
              <DropdownMenuSeparator />
              
              {/* Currency Toggle */}
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Display Currency
              </div>
              <DropdownMenuItem 
                onClick={() => handleCurrencyChange('USD')}
                className={`cursor-pointer ${currentCurrency === 'USD' ? 'bg-accent' : ''}`}
              >
                <DollarSign className="mr-2 h-4 w-4" />
                USD (Dollar)
                {currentCurrency === 'USD' && <span className="ml-auto text-xs">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleCurrencyChange('EUR')}
                className={`cursor-pointer ${currentCurrency === 'EUR' ? 'bg-accent' : ''}`}
              >
                <Euro className="mr-2 h-4 w-4" />
                EUR (Euro)
                {currentCurrency === 'EUR' && <span className="ml-auto text-xs">✓</span>}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Privacy
              </div>
              <DropdownMenuItem
                onClick={toggleHideMoney}
                className="cursor-pointer"
              >
                {hideMoney ? (
                  <Eye className="mr-2 h-4 w-4" />
                ) : (
                  <EyeOff className="mr-2 h-4 w-4" />
                )}
                {hideMoney ? 'Show balances' : 'Hide balances'}
                {hideMoney && <span className="ml-auto text-xs">✓</span>}
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <AiUsageMenu hideMoney={hideMoney} open={accountOpen} />
              <DropdownMenuSeparator />

              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Tools
              </div>
              <DropdownMenuItem
                onClick={() => setTaxEstimatorOpen(true)}
                className="cursor-pointer"
              >
                <Calculator className="mr-2 h-4 w-4" />
                Tax estimator
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/* Exports moved to user menu for a cleaner UI */}
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Export
              </div>
              <DropdownMenuItem onClick={handleExportTransactions} className="cursor-pointer">
                <Download className="mr-2 h-4 w-4" />
                Transactions (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportHoldings} className="cursor-pointer">
                <Download className="mr-2 h-4 w-4" />
                Current Holdings (CSV)
              </DropdownMenuItem>

              {hasAiKey && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                    Import
                  </div>
                  <DropdownMenuItem onClick={handleImportCsv} className="cursor-pointer">
                    <Upload className="mr-2 h-4 w-4" />
                    Transactions (CSV)
                    <Sparkles className="ml-1 h-3 w-3" />
                  </DropdownMenuItem>
                </>
              )}

              <DropdownMenuSeparator />
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Account
              </div>
              <DropdownMenuItem
                onClick={() => setSettingsOpen(true)}
                className="cursor-pointer"
              >
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleLogout}
                className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mounted for event-driven open from dropdown + internal dialog state */}
      <ImportTransactionsModal preferredCurrency={currentCurrency} />
      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        preferredCurrency={currentCurrency}
        initialProfile={investorProfile}
      />
      <TaxEstimatorModal
        open={taxEstimatorOpen}
        onOpenChange={setTaxEstimatorOpen}
        preferredCurrency={currentCurrency}
      />
    </nav>
  )
}