'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import PasswordInput from '@/components/PasswordInput'
import { ClipboardListIcon, PackageIcon, TargetIcon, AwardIcon, LayoutDashboardIcon, TagIcon, type LucideIcon } from 'lucide-react'

const INPUT =
  'w-full bg-ink-800 border border-courtline rounded-xl px-4 py-3 text-chalk placeholder-chalk-dim focus:outline-none focus:border-ember-500 transition-colors'
const LABEL = 'block text-xs font-semibold uppercase tracking-wide text-chalk-dim mb-1.5'

// The three things that answer "what do I physically/measurably get" — full cards.
const PRIMARY: { Icon: LucideIcon; title: string; body: string }[] = [
  {
    Icon: ClipboardListIcon,
    title: 'The full 10-week program',
    body: 'A turnkey coach’s guide — every week laid out with demonstrations, drills, timing, coaching cues, and a game. Open a week and run the hour.',
  },
  {
    Icon: PackageIcon,
    title: 'A training ball for every player',
    body: 'Each enrolled player gets a LearnHoops training ball sized to their age group, shipped to you.',
  },
  {
    Icon: TargetIcon,
    title: '2 AI shot analyses per player',
    body: 'A Week 1 baseline and a Week 10 retest — a measurable before-and-after of every player’s shooting form.',
  },
]

// Secondary perks folded into a tighter row rather than six stacked cards.
const EXTRAS: { Icon: LucideIcon; label: string }[] = [
  { Icon: AwardIcon, label: 'Completion certificate' },
  { Icon: LayoutDashboardIcon, label: 'Org dashboard' },
  { Icon: TagIcon, label: '$1.49 analysis rate' },
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
            <p className="eyebrow text-ember-400 select-none">For clubs &amp; organizations</p>
            <h1 className="font-display font-black uppercase text-[clamp(2.1rem,4.8vw,3.5rem)] leading-[0.95]">
              Bring AI shot analysis
              <span className="text-gradient-ember"> to your whole club</span>
            </h1>
            <p className="text-chalk-dim text-base leading-relaxed max-w-md">
              Apply for an organization account to run the <strong className="text-chalk">10-Week Shooting
              Development Program</strong> — a complete, coach-ready plan that measures every player’s shot before and
              after with LearnHoops AI.
            </p>

            {/* Price — its own figure, the first objection a decision-maker has. */}
            <div className="flex items-center gap-3">
              <div className="shrink-0 rounded-2xl border border-courtline bg-ink-900 px-4 py-2.5 text-center">
                <p className="font-numeric font-black text-ember-500 text-2xl leading-none">$40</p>
                <p className="font-display uppercase text-chalk-dim text-[10px] tracking-wide mt-1">per player</p>
              </div>
              <p className="text-chalk-dim text-sm">
                <span className="font-numeric text-chalk">$36.99</span>/player for 30+. Everything below is included.
              </p>
            </div>

            {/* Primary benefits — monochrome ember icons, matching the site's icon system. */}
            <div className="space-y-3">
              {PRIMARY.map(({ Icon, title, body }) => (
                <div key={title} className="flex gap-3 bg-ink-900/60 border border-courtline rounded-xl p-3.5">
                  <Icon className="w-6 h-6 text-ember-400 shrink-0 mt-0.5" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-chalk leading-tight">{title}</p>
                    <p className="text-chalk-dim text-sm leading-relaxed mt-0.5">{body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Secondary perks — compact row. */}
            <div className="flex flex-wrap gap-2">
              {EXTRAS.map(({ Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5 bg-ink-900/60 border border-courtline rounded-full px-3 py-1.5 text-xs text-chalk">
                  <Icon className="w-3.5 h-3.5 text-ember-400 shrink-0" aria-hidden />
                  {label}
                </span>
              ))}
            </div>

            {/* Real trust signal — reuse the home page's org card, not an invented stat. */}
            <div>
              <p className="eyebrow text-hardwood mb-2 select-none">Trusted on the court</p>
              <div className="card-lift inline-flex items-center gap-4 bg-ink-800 border border-courtline rounded-2xl px-5 py-3">
                <Image src="/maple-basketball-logo.png" alt="Maple Basketball logo" width={48} height={48} className="object-contain rounded-xl" />
                <div>
                  <p className="text-chalk text-sm font-bold leading-tight">Maple Basketball</p>
                  <p className="text-chalk-dim text-xs">Vaughan, ON</p>
                </div>
              </div>
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
