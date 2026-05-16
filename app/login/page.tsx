'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import TopNav from '@/components/TopNav'
import PasswordInput from '@/components/PasswordInput'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/dashboard'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')
  // Set when a coach has several teams and must pick one before logging in.
  const [teams, setTeams] = useState<Array<{ id: string; name: string }> | null>(null)

  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(({ account }) => {
        // Already logged in — send players to `next`, coaches/orgs to their dashboard.
        if (!account) return
        router.replace(account.type === 'player' ? next : account.dashboard)
      })
      .catch(() => {})
  }, [router, next])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        setStatus('error')
        return
      }

      // A coach with multiple teams picks one before the session is issued.
      if (data.multipleTeams === true) {
        setTeams(data.teams)
        setStatus('idle')
        return
      }

      // Coaches and organizations go to their dashboard; players honor `next`.
      router.push(data.redirect || next)
    } catch {
      setError('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  async function selectTeam(teamId: string) {
    setStatus('loading')
    setError('')

    try {
      const res = await fetch('/api/team/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, email: email.toLowerCase().trim() }),
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error || 'Could not select team')
        setStatus('error')
        return
      }

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
            <h1 className="text-2xl font-black text-black">Log in to LearnHoops</h1>
            <p className="text-gray-500 text-sm">Players, coaches, and organizations — one login</p>
          </div>

          {teams ? (
            <div className="space-y-3">
              <h2 className="text-lg font-black text-black text-center">Select your team</h2>
              {error && <p className="text-red-500 text-sm text-center">{error}</p>}
              <div className="space-y-2">
                {teams.map(t => (
                  <button
                    key={t.id}
                    onClick={() => selectTeam(t.id)}
                    disabled={status === 'loading'}
                    className="w-full border border-gray-200 hover:border-orange-500 rounded-xl p-4 text-left transition-colors disabled:opacity-60"
                  >
                    <span className="font-semibold text-black">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  required
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
                />
                <PasswordInput
                  required
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold py-3 rounded-xl transition-colors"
                >
                  {status === 'loading' ? 'Logging in...' : 'Log In'}
                </button>
              </form>

              <p className="text-center text-sm text-gray-500">
                <a href="/forgot-password" className="text-orange-500 hover:underline font-medium">Forgot your password?</a>
              </p>
              <p className="text-center text-sm text-gray-500">
                Don&apos;t have an account?{' '}
                <a href={`/signup?next=${encodeURIComponent(next)}`} className="text-orange-500 hover:underline font-medium">Sign up</a>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-white flex flex-col">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-5xl animate-bounce">🏀</div>
        </div>
      </main>
    }>
      <LoginForm />
    </Suspense>
  )
}
