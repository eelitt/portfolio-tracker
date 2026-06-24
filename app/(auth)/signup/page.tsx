'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      alert(error.message)
    } else {
      alert('Check your email for a confirmation link (if email confirmation is enabled in Supabase).')
      // After signup, redirect to login
      window.location.href = '/login'
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSignup} className="space-y-4 w-full max-w-sm">
      <h1 className="text-2xl font-bold">Create Account</h1>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full p-2 border rounded"
        required
      />
      <input
        type="password"
        placeholder="Password (min 6 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full p-2 border rounded"
        required
        minLength={6}
      />
      <button
        type="submit"
        disabled={loading}
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