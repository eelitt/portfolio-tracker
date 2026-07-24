'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'
import { ensureAppAccess } from '@/app/actions/users'
import { APP_ACCESS_DENIED_MESSAGE } from '@/lib/userTypes'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [supabaseStatus, setSupabaseStatus] = useState<'checking' | 'available' | 'unavailable'>('checking')
  const [loginError, setLoginError] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('reason') === 'access') {
      setLoginError(APP_ACCESS_DENIED_MESSAGE)
    }
  }, [])

  useEffect(() => {
    const checkSupabaseConnection = async () => {
      try {
        // Lightweight check to see if Supabase is reachable
        await supabase.auth.getSession()
        setSupabaseStatus('available')
      } catch (error) {
        console.error('Supabase connection check failed:', error)
        setSupabaseStatus('unavailable')
      }
    }

    checkSupabaseConnection()
  }, [supabase])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (supabaseStatus !== 'available') return

    setLoading(true)
    setLoginError(null)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        if (isSupabaseNetworkError(error)) {
          setLoginError('Unable to connect to the service. Please check your internet connection and try again.')
        } else if (error.message?.toLowerCase().includes('invalid api key') || error.message?.toLowerCase().includes('project not found')) {
          setLoginError('There is a configuration error with the backend. Please contact support.')
        } else if (error.message?.toLowerCase().includes('invalid login') || error.message?.toLowerCase().includes('credentials')) {
          setLoginError('Invalid email or password.')
        } else {
          setLoginError(error.message)
        }
      } else {
        const access = await ensureAppAccess()
        if (!access.ok) {
          setLoginError(access.error)
          return
        }
        window.location.href = '/dashboard'
      }
    } catch (err: any) {
      console.error('Login error:', err)
      if (isSupabaseNetworkError(err)) {
        setLoginError('Unable to connect to the service. Please check your internet connection and try again.')
      } else if (err.message?.toLowerCase().includes('invalid api key') || err.message?.toLowerCase().includes('project not found')) {
        setLoginError('There is a configuration error with the backend. Please contact support.')
      } else {
        setLoginError('An unexpected error occurred. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  function isSupabaseNetworkError(error: any): boolean {
    if (!error) return false
    const message = (error.message || '').toLowerCase()
    return (
      message.includes('fetch') ||
      message.includes('failed to fetch') ||
      message.includes('network') ||
      error.code === 'ENOTFOUND' ||
      error.cause?.code === 'ENOTFOUND' ||
      !navigator.onLine
    )
  }

  const retryConnection = () => {
    setSupabaseStatus('checking')
    // Re-run the effect logic
    window.location.reload()
  }

  if (supabaseStatus === 'unavailable') {
    return (
      <div className="w-full max-w-sm">
        <div className="alert-error rounded-xl p-6 text-center shadow-xl">
          <h1 className="mb-2 font-display text-xl font-semibold">
            Service unavailable
          </h1>
          <p className="mb-4 text-sm opacity-90">
            Portfolio Tracker is currently unable to connect to its backend service.
            Please check your internet connection or try again later.
          </p>
          <button
            onClick={retryConnection}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const isFormDisabled = supabaseStatus !== 'available' || loading

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value)
    setLoginError(null)
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value)
    setLoginError(null)
  }

  return (
    <form
      onSubmit={handleLogin}
      className="surface-panel w-full max-w-sm space-y-4 rounded-xl p-6 shadow-xl"
    >
      <div className="mb-2 text-center font-display text-2xl font-semibold tracking-tight">
        <span className="text-gold">Portfolio</span>{' '}
        <span className="text-foreground">Tracker</span>
      </div>
      {loginError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {loginError}
        </div>
      )}
      <h1 className="font-display text-xl font-semibold">Log in</h1>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={handleEmailChange}
        className="h-9 w-full rounded-lg border border-border/70 bg-card px-3 text-sm focus-visible:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/30"
        required
        disabled={isFormDisabled}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={handlePasswordChange}
        className="h-9 w-full rounded-lg border border-border/70 bg-card px-3 text-sm focus-visible:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/30"
        required
        disabled={isFormDisabled}
      />
      <button
        type="submit"
        disabled={isFormDisabled}
        className="h-9 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-70"
      >
        {loading ? 'Logging in…' : 'Log in'}
      </button>
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <a href="/signup" className="text-gold underline-offset-4 hover:underline">
          Sign up
        </a>
      </p>
    </form>
  )
}
