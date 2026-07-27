'use client'

import { useState, useEffect } from 'react'
import { trackCompleteRegistration } from '@/lib/meta-pixel'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import Image from 'next/image'
import PasswordInput from '@/components/PasswordInput'

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [teamCode, setTeamCode] = useState(searchParams.get('teamCode') || '')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')

  const teamInviteToken = searchParams.get('teamInvite') || ''
  const claimToken = searchParams.get('claimToken') || ''
  const pendingCredits = parseInt(searchParams.get('credits') || '0', 10)

  useEffect(() => {
    // Pre-fill email from Stripe checkout redirect (subscription flow only)
    const sessionId = searchParams.get('session_id')
    if (sessionId) {
      fetch(`/api/subscribe/session-email?session_id=${sessionId}`)
        .then(r => r.json())
        .then(({ email: e }) => { if (e) setEmail(e) })
        .catch(() => {})
    }
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setStatus('loading')
    setError('')

    try {
      const body: Record<string, string> = { email, password }
      if (nickname.trim()) body.nickname = nickname.trim()
      if (teamInviteToken) body.teamInviteToken = teamInviteToken
      if (claimToken) body.claimToken = claimToken

      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Signup failed')
        setStatus('error')
        return
      }

      trackCompleteRegistration()

      const tc = teamCode.trim()
      if (tc) {
        // Carry the team code to the dashboard, which pops up the
        // "enter your name to join" prompt.
        router.push(`/dashboard?joinTeam=${encodeURIComponent(tc)}`)
      } else {
        // Brand-new accounts land on the dashboard with the one-time
        // starter offer popped open (welcome=1).
        const next = searchParams.get('next') || '/dashboard?welcome=1'
        router.push(next)
      }
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
            <Image src="/icon.png" alt="" width={48} height={48} className="mx-auto rounded-2xl select-none" aria-hidden />
            <h1 className="font-display font-black uppercase text-2xl leading-tight">Create your account</h1>
            {pendingCredits > 0 ? (
              <p className="text-sm font-semibold text-ember-400 bg-ember-500/10 border border-ember-500/30 rounded-xl px-4 py-2">
                Your ball order includes {pendingCredits} free shot {pendingCredits === 1 ? 'analysis' : 'analyses'} — they&apos;ll be added to your account automatically.
              </p>
            ) : teamInviteToken ? (
              <p className="text-sm font-semibold text-ember-400 bg-ember-500/10 border border-ember-500/30 rounded-xl px-4 py-2">
                Your coach added you to the team — sign up to join.
              </p>
            ) : (
              <p className="text-chalk-dim text-sm">Track your shot progress over time</p>
            )}
          </div>

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
            <input
              type="text"
              placeholder="Nickname (e.g. Buckets, KD, Air)"
              maxLength={50}
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              className="w-full bg-ink-800 border border-courtline rounded-xl px-4 py-3 text-chalk placeholder-chalk-dim focus:outline-none focus:border-ember-500 transition-colors"
            />
            <PasswordInput
              required
              minLength={6}
              name="new-password"
              autoComplete="new-password"
              aria-label="Password"
              placeholder="Password (6+ characters)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-ink-800 border border-courtline rounded-xl pl-4 pr-11 py-3 text-chalk placeholder-chalk-dim focus:outline-none focus:border-ember-500 transition-colors"
            />
            <PasswordInput
              required
              name="confirm-password"
              autoComplete="new-password"
              aria-label="Confirm password"
              placeholder="Confirm password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="w-full bg-ink-800 border border-courtline rounded-xl pl-4 pr-11 py-3 text-chalk placeholder-chalk-dim focus:outline-none focus:border-ember-500 transition-colors"
            />
            <div>
              <input
                type="text"
                placeholder="Team code (optional)"
                value={teamCode}
                onChange={e => setTeamCode(e.target.value.toUpperCase())}
                className="w-full bg-ink-800 border border-courtline rounded-xl px-4 py-3 text-chalk placeholder-chalk-dim focus:outline-none focus:border-ember-500 transition-colors"
              />
              <p className="text-xs text-chalk-dim mt-1.5">
                Have a team? Enter your coach&apos;s team code to join after signing up.
              </p>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-ember-500 hover:bg-ember-400 disabled:opacity-50 active:scale-[0.99] text-ink-950 font-bold py-3.5 rounded-full transition-all"
            >
              {status === 'loading' ? 'Creating account...' : 'Create Account →'}
            </button>
          </form>

          <p className="text-center text-sm text-chalk-dim">
            Already have an account?{' '}
            <a
              href={claimToken
                ? `/login?claimToken=${encodeURIComponent(claimToken)}&credits=${pendingCredits}`
                : '/login'}
              className="text-ember-400 hover:text-ember-500 font-medium transition-colors"
            >
              Log in
            </a>
          </p>
        </div>
      </div>
      <SiteFooter />
    </main>
  )
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  )
}
