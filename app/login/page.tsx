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
  const claimToken = searchParams.get('claimToken') || ''
  const pendingCredits = parseInt(searchParams.get('credits') || '0', 10)
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
        body: JSON.stringify({ email, password, ...(claimToken ? { claimToken } : {}) }),
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
    <main className="min-h-screen bg-ink-950 text-chalk flex flex-col">
      <TopNav />
      <div className="hero-glow grain relative flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-3">
            <div className="text-4xl select-none">🏀</div>
            <h1 className="font-display font-black uppercase text-2xl leading-tight">Log in to LearnHoops</h1>
            {pendingCredits > 0 ? (
              <p className="text-sm font-semibold text-ember-400 bg-ember-500/10 border border-ember-500/30 rounded-xl px-4 py-2">
                Log in and your {pendingCredits} free shot {pendingCredits === 1 ? 'analysis' : 'analyses'} from your ball order will be added to your account.
              </p>
            ) : (
              <p className="text-chalk-dim text-sm">Players, coaches, and organizations — one login</p>
            )}
          </div>

          {teams ? (
            <div className="space-y-3">
              <h2 className="font-display font-black uppercase text-lg text-center">Select your team</h2>
              {error && <p className="text-red-400 text-sm text-center">{error}</p>}
              <div className="space-y-2">
                {teams.map(t => (
                  <button
                    key={t.id}
                    onClick={() => selectTeam(t.id)}
                    disabled={status === 'loading'}
                    className="w-full bg-ink-900 border border-courtline hover:border-ember-500/60 rounded-xl p-4 text-left transition-colors disabled:opacity-60 active:scale-[0.99]"
                  >
                    <span className="font-semibold text-chalk">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-3 bg-ink-900 border border-courtline rounded-2xl p-5">
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  aria-label="Email"
                  required
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-ink-800 border border-courtline rounded-xl px-4 py-3 text-chalk placeholder-chalk-dim focus:outline-none focus:border-ember-500 transition-colors"
                />
                <PasswordInput
                  required
                  name="password"
                  autoComplete="current-password"
                  aria-label="Password"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-ink-800 border border-courtline rounded-xl pl-4 pr-11 py-3 text-chalk placeholder-chalk-dim focus:outline-none focus:border-ember-500 transition-colors"
                />
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full bg-ember-500 hover:bg-ember-600 disabled:opacity-50 active:scale-[0.99] text-white font-bold py-3.5 rounded-full transition-all"
                >
                  {status === 'loading' ? 'Logging in...' : 'Log In'}
                </button>
              </form>

              <p className="text-center text-sm text-chalk-dim">
                <a href="/forgot-password" className="text-ember-400 hover:text-ember-500 font-medium transition-colors">Forgot your password?</a>
              </p>
              <p className="text-center text-sm text-chalk-dim">
                Don&apos;t have an account?{' '}
                <a href={`/signup?next=${encodeURIComponent(next)}`} className="text-ember-400 hover:text-ember-500 font-medium transition-colors">Sign up</a>
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
      <main className="min-h-screen bg-ink-950 flex flex-col">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-5xl animate-bounce select-none">🏀</div>
        </div>
      </main>
    }>
      <LoginForm />
    </Suspense>
  )
}
