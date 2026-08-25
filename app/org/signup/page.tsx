'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import PasswordInput from '@/components/PasswordInput'

const INPUT =
  'w-full bg-ink-800 border border-courtline rounded-xl px-4 py-3 text-chalk placeholder-chalk-dim focus:outline-none focus:border-ember-500 transition-colors'
const LABEL = 'block text-xs font-semibold uppercase tracking-wide text-chalk-dim mb-1.5'

const BENEFITS: { icon: string; title: string; body: string }[] = [
  {
    icon: '📋',
    title: 'The full 10-week program',
    body: 'A turnkey coach’s guide — every week laid out with demonstrations, drills, timing, coaching cues, and a game. Open a week and run the hour.',
  },
  {
    icon: '🏀',
    title: 'A training ball for every player',
    body: 'Each enrolled player gets a LearnHoops training ball sized to their age group, shipped to you.',
  },
  {
    icon: '🎯',
    title: '2 AI shot analyses per player',
    body: 'A Week 1 baseline and a Week 10 retest — a measurable before-and-after of every player’s shooting form.',
  },
  {
    icon: '🏆',
    title: 'A completion certificate',
    body: 'Each player finishes with a personalized certificate showing their scores and how much they improved.',
  },
  {
    icon: '📊',
    title: 'An organization dashboard',
    body: 'Manage teams, coaches and players in one place, with join codes and per-player progress.',
  },
  {
    icon: '💸',
    title: 'A $0.99 analysis rate',
    body: 'Buying a program package unlocks the discounted $0.99 per-analysis rate for your whole organization.',
  },
]

function OrgSignupInner() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token')

  // Application form state
  const [orgName, setOrgName] = useState('')
  const [email, setEmail] = useState('')
  const [playerCount, setPlayerCount] = useState('')
  const [applied, setApplied] = useState(false)

  // Registration form state (token flow)
  const [regOrgName, setRegOrgName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleApply(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setError('')
    try {
      const res = await fetch('/api/org/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgName, email, playerCount: playerCount ? parseInt(playerCount) : null }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        setStatus('error')
        return
      }
      setApplied(true)
      setStatus('idle')
    } catch {
      setError('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    setStatus('loading')
    setError('')
    try {
      const res = await fetch('/api/org/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: regOrgName, email: regEmail, password, token }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Registration failed')
        setStatus('error')
        return
      }
      router.push('/org/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  // Token flow — approved applicant creates their account.
  if (token) {
    return (
      <main className="min-h-screen bg-ink-950 text-chalk flex flex-col">
        <TopNav />
        <div className="hero-glow grain relative flex-1 flex items-center justify-center px-6 py-16">
          <div className="w-full max-w-sm space-y-6">
            <div className="text-center space-y-3">
              <Image src="/icon.png" alt="" width={48} height={48} className="mx-auto rounded-2xl select-none" aria-hidden />
              <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-ember-400 bg-ember-500/10 border border-ember-500/30 rounded-full px-3 py-1">
                Application approved
              </span>
              <h1 className="font-display font-black uppercase text-2xl leading-tight">Set up your organization</h1>
              <p className="text-chalk-dim text-sm">Create your account to open your dashboard.</p>
            </div>
            <form onSubmit={handleRegister} className="space-y-4 bg-ink-900 border border-courtline rounded-2xl p-5">
              <div>
                <label className={LABEL}>Organization name</label>
                <input type="text" required value={regOrgName} onChange={e => setRegOrgName(e.target.value)} placeholder="e.g. Metro Youth Basketball" className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Email</label>
                <input type="email" required value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="admin@yourorg.com" className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Password</label>
                <PasswordInput value={password} onChange={e => setPassword(e.target.value)} placeholder="6+ characters" className={`${INPUT} pr-11`} />
              </div>
              <div>
                <label className={LABEL}>Confirm password</label>
                <PasswordInput value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" className={`${INPUT} pr-11`} />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full bg-ember-500 hover:bg-ember-400 disabled:opacity-50 active:scale-[0.99] text-ink-950 font-bold py-3.5 rounded-full transition-all"
              >
                {status === 'loading' ? 'Creating account…' : 'Create account →'}
              </button>
            </form>
          </div>
        </div>
        <SiteFooter />
      </main>
    )
  }

  // Application submitted confirmation.
  if (applied) {
    return (
      <main className="min-h-screen bg-ink-950 text-chalk flex flex-col">
        <TopNav />
        <div className="hero-glow grain relative flex-1 flex items-center justify-center px-6 py-16">
          <div className="w-full max-w-md text-center space-y-5 bg-ink-900 border border-courtline rounded-2xl p-8">
            <div className="mx-auto w-14 h-14 rounded-full bg-ember-500/15 border border-ember-500/30 flex items-center justify-center text-2xl">✓</div>
            <h1 className="font-display font-black uppercase text-2xl leading-tight">Application submitted</h1>
            <p className="text-chalk-dim text-sm leading-relaxed">
              Thanks — we’ve got it. We’ll review your organization and send a setup link to{' '}
              <strong className="text-chalk">{email}</strong> once you’re approved. Approvals usually land within a
              business day.
            </p>
            <a href="/" className="inline-block text-ember-400 hover:text-ember-500 font-semibold text-sm transition-colors">
              ← Back to home
            </a>
          </div>
        </div>
        <SiteFooter />
      </main>
    )
  }

  // Default — application form with a full pitch panel.
  return (
    <main className="min-h-screen bg-ink-950 text-chalk flex flex-col">
      <TopNav />
      <div className="hero-glow grain relative flex-1 px-6 py-14 sm:py-16">
        <div className="w-full max-w-5xl mx-auto grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">

          {/* Pitch panel */}
          <div className="space-y-6">
            <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-ember-400 bg-ember-500/10 border border-ember-500/30 rounded-full px-3 py-1">
              For clubs &amp; organizations
            </span>
            <h1 className="font-display font-black uppercase text-4xl sm:text-5xl leading-[0.95]">
              Bring AI shot analysis
              <span className="text-gradient-ember"> to your whole club</span>
            </h1>
            <p className="text-chalk-dim text-base leading-relaxed max-w-md">
              Apply for an organization account to run the <strong className="text-chalk">10-Week Shooting
              Development Program</strong> — a complete, coach-ready plan that measures every player’s shot before and
              after with LearnHoops AI. Starting at <span className="font-numeric text-chalk">$40</span>/player.
            </p>

            <div className="space-y-3">
              {BENEFITS.map(b => (
                <div key={b.title} className="flex gap-3 bg-ink-900/60 border border-courtline rounded-xl p-3.5">
                  <div className="shrink-0 text-xl leading-none mt-0.5" aria-hidden>{b.icon}</div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-chalk leading-tight">{b.title}</p>
                    <p className="text-chalk-dim text-sm leading-relaxed mt-0.5">{b.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Application form */}
          <div className="lg:sticky lg:top-24">
            <div className="bg-ink-900 border border-courtline rounded-2xl p-6 sm:p-7 space-y-5">
              <div className="space-y-1.5">
                <h2 className="font-display font-black uppercase text-xl leading-tight">Apply for an organization account</h2>
                <p className="text-chalk-dim text-sm">
                  Tell us about your club and we’ll follow up with next steps. No payment now — this is just an application.
                </p>
              </div>

              <form onSubmit={handleApply} className="space-y-4">
                <div>
                  <label className={LABEL}>Organization name</label>
                  <input type="text" required value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="e.g. Metro Youth Basketball" className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Your email</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@yourorg.com" className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Players in your club (estimate)</label>
                  <input type="number" min={1} value={playerCount} onChange={e => setPlayerCount(e.target.value)} placeholder="e.g. 45" className={INPUT} />
                  <p className="text-xs text-chalk-dim mt-1.5">Just a rough number — it helps us tailor your setup.</p>
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full bg-ember-500 hover:bg-ember-400 disabled:opacity-50 active:scale-[0.99] text-ink-950 font-bold py-3.5 rounded-full transition-all"
                >
                  {status === 'loading' ? 'Submitting…' : 'Submit application →'}
                </button>
              </form>

              <p className="text-center text-sm text-chalk-dim">
                Already have an organization?{' '}
                <a href="/org/login" className="text-ember-400 hover:text-ember-500 font-semibold transition-colors">
                  Log in
                </a>
              </p>
            </div>
          </div>

        </div>
      </div>
      <SiteFooter />
    </main>
  )
}

export default function OrgSignupPage() {
  return (
    <Suspense>
      <OrgSignupInner />
    </Suspense>
  )
}
