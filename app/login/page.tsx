'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import Image from 'next/image'
import PasswordInput from '@/components/PasswordInput'
import OAuthButtons from '@/components/OAuthButtons'
import { LoaderCircleIcon } from 'lucide-react'

// Messages for a provider round trip that came back without a session. The
// callback can only hand back a reason code in the URL, so the wording lives
// here rather than in the route.
const OAUTH_ERRORS: Record<string, string> = {
  oauth_cancelled: 'Sign-in was cancelled.',
  oauth_no_email: 'That sign-in did not share an email address, so we could not create an account.',
  oauth_choose_account: 'More than one player uses this email address, so we can’t tell which one to sign in to. Log in with that player’s email and password instead.',
  oauth_failed: 'That sign-in could not be completed. Please try again.',
  oauth_unavailable: 'Google and Apple sign-in are not available right now — use your email and password.',
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/dashboard'
  const claimToken = searchParams.get('claimToken') || ''
  const pendingCredits = parseInt(searchParams.get('credits') || '0', 10)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState(OAUTH_ERRORS[searchParams.get('error') ?? ''] ?? '')
  // Set when a coach has several teams and must pick one before logging in.
  const [teams, setTeams] = useState<Array<{ id: string; name: string }> | null>(null)
  // Proof from the login call that the password was accepted, naming the teams
  // this coach may choose between. Kept in memory only — /api/team/select will
  // not issue a session without it.
  const [choiceToken, setChoiceToken] = useState('')
  // Set when one sign-in opened several player accounts: a shared login
  // (password, with a player-choice token) or Google/Apple on an address
  // several players share (`oauth` — the choice lives in an httpOnly cookie).
  const [players, setPlayers] = useState<Array<{ id: string; firstName: string }> | null>(null)
  const [playerChoice, setPlayerChoice] = useState<{ via: 'password'; token: string } | { via: 'oauth' } | null>(null)
  const chooseOAuth = searchParams.get('choose') === 'oauth'

  useEffect(() => {
    if (!chooseOAuth) return
    fetch('/api/auth/select-player/oauth')
      .then(async r => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (!ok || !Array.isArray(data.players)) {
          setError(data.error || 'That sign-in has expired. Please try again.')
          return
        }
        setPlayers(data.players)
        setPlayerChoice({ via: 'oauth' })
      })
      .catch(() => setError('Something went wrong. Please try again.'))
  }, [chooseOAuth])

  useEffect(() => {
    // A pending Google/Apple player choice is finished here even when an
    // older session is still around — choosing replaces it.
    if (chooseOAuth) return
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(({ account }) => {
        // Already logged in — send players to `next`, coaches/orgs to their dashboard.
        if (!account) return
        router.replace(account.type === 'player' ? next : account.dashboard)
      })
      .catch(() => {})
  }, [router, next, chooseOAuth])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // acceptsPlayerChoice: this page can show "Which player?" for a shared
        // login. Shipped app builds omit it and get a message instead.
        body: JSON.stringify({ email, password, acceptsPlayerChoice: true, ...(claimToken ? { claimToken } : {}) }),
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
        setChoiceToken(data.choiceToken ?? '')
        setStatus('idle')
        return
      }

      // A shared login (several players, one password) picks the player.
      if (data.multiplePlayers === true && Array.isArray(data.players)) {
        setPlayers(data.players)
        setPlayerChoice({ via: 'password', token: data.choiceToken ?? '' })
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
        body: JSON.stringify({ teamId, choiceToken }),
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

  async function selectPlayer(playerId: string) {
    if (!playerChoice) return
    setStatus('loading')
    setError('')

    try {
      const res =
        playerChoice.via === 'password'
          ? await fetch('/api/auth/select-player', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ playerId, choiceToken: playerChoice.token, ...(claimToken ? { claimToken } : {}) }),
            })
          : await fetch('/api/auth/select-player/oauth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ playerId }),
            })
      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.success) {
        setError(data.error || 'Could not sign in as that player')
        setStatus('error')
        return
      }

      router.push(data.redirect || next)
    } catch {
      setError('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  function backToLogin() {
    setPlayers(null)
    setPlayerChoice(null)
    setTeams(null)
    setChoiceToken('')
    setError('')
    setStatus('idle')
    if (chooseOAuth) router.replace('/login')
  }

  return (
    <main className="min-h-screen bg-ink-950 text-chalk flex flex-col">
      <TopNav />
      <div className="hero-glow grain relative flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-3">
            <Image src="/icon.png" alt="" width={48} height={48} className="mx-auto rounded-2xl select-none" aria-hidden />
            <h1 className="font-display font-black uppercase text-2xl leading-tight">Log in to LearnHoops</h1>
            {pendingCredits > 0 ? (
              <p className="text-sm font-semibold text-ember-400 bg-ember-500/10 border border-ember-500/30 rounded-xl px-4 py-2">
                Log in and your {pendingCredits} free shot {pendingCredits === 1 ? 'analysis' : 'analyses'} from your ball order will be added to your account.
              </p>
            ) : (
              <p className="text-chalk-dim text-sm">Players, coaches, and organizations — one login</p>
            )}
          </div>

          {players ? (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h2 className="font-display font-black uppercase text-lg">Which player?</h2>
                <p className="text-chalk-dim text-sm">
                  {playerChoice?.via === 'oauth'
                    ? 'More than one player uses this email. Choose who is signing in.'
                    : 'This login is shared. Choose who is signing in.'}
                </p>
              </div>
              {error && (
                <div role="alert" className="bg-red-500/15 border border-red-500 rounded-xl px-4 py-3">
                  <p className="text-red-400 text-sm font-semibold text-center">{error}</p>
                </div>
              )}
              <div className="space-y-3">
                {players.map(p => (
                  <button
                    key={p.id}
                    onClick={() => selectPlayer(p.id)}
                    disabled={status === 'loading'}
                    className="w-full bg-ink-900 border border-courtline hover:border-ember-500/60 rounded-2xl px-5 py-5 text-left transition-colors disabled:opacity-60 active:scale-[0.99] flex items-center justify-between"
                  >
                    <span className="font-display font-black text-xl text-chalk">{p.firstName}</span>
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="text-chalk-dim">
                      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ))}
              </div>
              <p className="text-center text-sm">
                <button type="button" onClick={backToLogin} className="text-ember-400 hover:text-ember-500 font-medium transition-colors">
                  Back to login
                </button>
              </p>
            </div>
          ) : teams ? (
            <div className="space-y-3">
              <h2 className="font-display font-black uppercase text-lg text-center">Select your team</h2>
              {error && (
                <div role="alert" className="bg-red-500/15 border-2 border-red-500 rounded-xl px-4 py-3">
                  <p className="text-red-400 text-sm font-bold text-center">{error}</p>
                </div>
              )}
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
              <OAuthButtons next={next} claimToken={claimToken} />

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
                  className="w-full bg-ember-500 hover:bg-ember-400 disabled:opacity-50 active:scale-[0.99] text-ink-950 font-bold py-3.5 rounded-full transition-all"
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
      <SiteFooter />
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-ink-950 flex flex-col">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <LoaderCircleIcon className="h-8 w-8 animate-spin text-chalk-dim" aria-label="Loading" />
        </div>
      </main>
    }>
      <LoginForm />
    </Suspense>
  )
}
