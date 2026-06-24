'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert(error.message)
    } else {
      window.location.href = '/dashboard'
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleLogin} className="space-y-4 w-full max-w-sm">
      <h1 className="text-2xl font-bold">Login</h1>
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
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full p-2 border rounded"
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full p-2 bg-black text-white rounded dark:bg-white dark:text-black dark:hover:bg-gray-200 hover:bg-gray-800 disabled:opacity-70 transition-colors"
      >
        {loading ? 'Logging in...' : 'Log in'}
      </button>
      <p className="text-sm text-center">
        Don&apos;t have an account? <a href="/signup" className="underline">Sign up</a>
      </p>
    </form>
  )
}