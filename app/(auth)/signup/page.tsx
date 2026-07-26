'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [supabaseStatus, setSupabaseStatus] = useState<'checking' | 'available' | 'unavailable'>('checking')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    const checkSupabaseConnection = async () => {
      try {
        await supabase.auth.getSession()
        setSupabaseStatus('available')
      } catch (error) {
        console.error('Supabase connection check failed:', error)
        setSupabaseStatus('unavailable')
      }
    }

    checkSupabaseConnection()
  }, [supabase])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (supabaseStatus !== 'available') return

    setLoading(true)
    setLoginError(null)
    setSuccessMessage(null)

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) {
        if (isSupabaseNetworkError(error)) {
          setLoginError('Unable to connect to the service. Please check your internet connection and try again.')
        } else if (error.message?.toLowerCase().includes('invalid api key') || error.message?.toLowerCase().includes('project not found')) {
          setLoginError('There is a configuration error with the backend. Please contact support.')
        } else {
          setLoginError(error.message)
        }
      } else {
        // Never leave an unapproved session active (email confirm may be off)
        if (data.session) {
          await supabase.auth.signOut()
        }
        setSuccessMessage(
          'Account created. An administrator must approve your access before you can sign in.'
        )
        setEmail('')
        setPassword('')
      }
    } catch (err: any) {
      console.error('Signup error:', err)
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
      onSubmit={handleSignup}
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
      {successMessage && (
        <div className="alert-success">
          {successMessage}{' '}
          <a href="/login" className="font-medium text-gold underline-offset-4 hover:underline">
            Go to login
          </a>
        </div>
      )}
      <h1 className="font-display text-xl font-semibold">Create account</h1>
      <p className="text-sm text-muted-foreground">
        After signing up, an administrator must approve your account before you can
        log in.
      </p>
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
        placeholder="Password (min 8 characters)"
        value={password}
        onChange={handlePasswordChange}
        className="h-9 w-full rounded-lg border border-border/70 bg-card px-3 text-sm focus-visible:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/30"
        required
        minLength={8}
        disabled={isFormDisabled}
      />
      <button
        type="submit"
        disabled={isFormDisabled}
        className="h-9 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-70"
      >
        {loading ? 'Creating account…' : 'Sign up'}
      </button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <a href="/login" className="text-gold underline-offset-4 hover:underline">
          Log in
        </a>
      </p>
    </form>
  )
}
