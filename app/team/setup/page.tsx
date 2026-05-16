'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import TopNav from '@/components/TopNav'
import PasswordInput from '@/components/PasswordInput'

function TeamSetupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setStatus('loading')
    setError('')

    try {
      const res = await fetch('/api/team/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Setup failed')
        setStatus('error')
        return
      }

      setStatus('success')
      router.push('/team/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <div className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="text-4xl">🏀</div>
            <h1 className="text-2xl font-black text-black">Set up your coach account</h1>
            <p className="text-gray-500 text-sm">Choose a password to access your team dashboard</p>
          </div>

          {!token ? (
            <p className="text-center text-red-500 text-sm font-medium">Invalid setup link.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <PasswordInput
                required
                minLength={6}
                placeholder="Password (6+ characters)"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <PasswordInput
                required
                placeholder="Confirm password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
              />
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={status === 'loading' || status === 'success'}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold py-3 rounded-xl transition-colors"
              >
                {status === 'loading' || status === 'success' ? 'Setting up...' : 'Set Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}

export default function TeamSetupPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-white flex flex-col">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-5xl animate-bounce">🏀</div>
        </div>
      </main>
    }>
      <TeamSetupForm />
    </Suspense>
  )
}
