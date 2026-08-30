'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import TopNav from '@/components/TopNav'
import WebOnlySignup from '@/components/WebOnlySignup'
import { useIsInApp } from '@/lib/useIsInApp'
import SiteFooter from '@/components/SiteFooter'
import PasswordInput from '@/components/PasswordInput'
import Turnstile, { TURNSTILE_ENABLED } from '@/components/Turnstile'
import Honeypot from '@/components/Honeypot'

function OrgSignupInner() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token')

  // Application form state
  const [orgName, setOrgName] = useState('')
  const [email, setEmail] = useState('')
  const [playerCount, setPlayerCount] = useState('')
  const [startPassword, setStartPassword] = useState('')
  const [startConfirm, setStartConfirm] = useState('')

  // Registration form state (token flow)
  const [regOrgName, setRegOrgName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')
  const [website, setWebsite] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')

  // Holds the details and the password, then hands off to the pricing page.
  // No organization exists until a payment clears — see
  // lib/create-org-from-checkout.ts.
  async function handleStart(e: React.FormEvent) {
    e.preventDefault()
    if (startPassword !== startConfirm) {
      setError('Passwords do not match')
      return
    }
    if (TURNSTILE_ENABLED && !captchaToken) {
      setError('Please wait for the human check to finish.')
      return
    }
    setStatus('loading')
    setError('')
    try {
      const res = await fetch('/api/org/signup/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgName,
          email,
          password: startPassword,
          playerCount: playerCount ? parseInt(playerCount) : null,
          website,
          turnstileToken: captchaToken,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        setStatus('error')
        setCaptchaToken('')
        return
      }
      router.push('/org/pricing')
    } catch {
      setError('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (TURNSTILE_ENABLED && !captchaToken) {
      setError('Please wait for the human check to finish.')
      return
    }
    setStatus('loading')
    setError('')
    try {
      const res = await fetch('/api/org/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regOrgName,
          email: regEmail,
          password,
          token,
          turnstileToken: captchaToken,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Registration failed')
        setStatus('error')
        setCaptchaToken('')
        return
      }
      router.push('/org/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  // Token flow — show full registration form
  if (token) {
    return (
      <main className="min-h-screen bg-white flex flex-col">
        <TopNav />
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm space-y-6">
            <div className="text-center space-y-2">
              <div className="text-4xl">🏀</div>
              <h1 className="text-2xl font-black text-black">Set up your organization</h1>
              <p className="text-gray-500 text-sm">Your application was approved — create your account below.</p>
            </div>
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Organization name</label>
                <input
                  type="text"
                  required
                  value={regOrgName}
                  onChange={e => setRegOrgName(e.target.value)}
                  placeholder="e.g. Metro Youth Basketball"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  placeholder="admin@yourorg.com"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
                <PasswordInput value={password} onChange={e => setPassword(e.target.value)} placeholder="6+ characters" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Confirm password</label>
                <PasswordInput value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" />
              </div>
              <Turnstile onToken={setCaptchaToken} theme="light" />
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-ink-950 font-black py-3 rounded-xl transition-colors"
              >
                {status === 'loading' ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </div>
        </div>
        <SiteFooter />
      </main>
    )
  }

  // Default — the signup form
  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="text-4xl">🏀</div>
            <h1 className="text-2xl font-black text-black">Start your organization</h1>
            <p className="text-gray-500 text-sm">Tell us about your club and pick a plan — you&apos;ll be set up in a couple of minutes.</p>
          </div>
          <form onSubmit={handleStart} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Organization name</label>
              <input
                type="text"
                required
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                placeholder="e.g. Metro Youth Basketball"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Your email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@yourorg.com"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Number of players in your club (estimate)</label>
              <input
                type="number"
                min={1}
                value={playerCount}
                onChange={e => setPlayerCount(e.target.value)}
                placeholder="e.g. 45"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
              <PasswordInput value={startPassword} onChange={e => setStartPassword(e.target.value)} placeholder="6+ characters" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Confirm password</label>
              <PasswordInput value={startConfirm} onChange={e => setStartConfirm(e.target.value)} placeholder="Repeat password" />
            </div>
            <Honeypot value={website} onChange={setWebsite} />
            <Turnstile onToken={setCaptchaToken} theme="light" />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-ink-950 font-black py-3 rounded-xl transition-colors"
            >
              {status === 'loading' ? 'Just a moment…' : 'Get started today'}
            </button>
            <p className="text-xs text-gray-400 text-center">Next: choose a plan. Your account is created once payment goes through.</p>
          </form>
        </div>
      </div>
      <SiteFooter />
    </main>
  )
}

export default function OrgSignupPage() {
  // Coach and organization accounts are created on the website only —
  // they are billed surfaces with rosters and invoices behind them.
  const inApp = useIsInApp()
  if (inApp) return <WebOnlySignup kind="organization" />

  return (
    <Suspense>
      <OrgSignupInner />
    </Suspense>
  )
}
