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
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <h1 className="text-xl font-semibold text-red-700 mb-2">Service Unavailable</h1>
          <p className="text-sm text-red-600 mb-4">
            Portfolio Tracker is currently unable to connect to its backend service.
            Please check your internet connection or try again later.
          </p>
          <button
            onClick={retryConnection}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
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
    <form onSubmit={handleSignup} className="space-y-4 w-full max-w-sm">
      {loginError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          {loginError}
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded">
          {successMessage}{' '}
          <a href="/login" className="underline font-medium">
            Go to login
          </a>
        </div>
      )}
      <h1 className="text-2xl font-bold">Create Account</h1>
      <p className="text-sm text-muted-foreground">
        After signing up, an administrator must approve your account before you can log in.
      </p>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={handleEmailChange}
        className="w-full p-2 border rounded"
        required
        disabled={isFormDisabled}
      />
      <input
        type="password"
        placeholder="Password (min 6 characters)"
        value={password}
        onChange={handlePasswordChange}
        className="w-full p-2 border rounded"
        required
        minLength={6}
        disabled={isFormDisabled}
      />
      <button
        type="submit"
        disabled={isFormDisabled}
        className="w-full p-2 bg-black text-white rounded dark:bg-white dark:text-black dark:hover:bg-gray-200 hover:bg-gray-800 disabled:opacity-70 transition-colors"
      >
        {loading ? 'Creating account...' : 'Sign up'}
      </button>
      <p className="text-sm text-center">
        Already have an account? <a href="/login" className="underline">Log in</a>
      </p>
    </form>
  )
}
