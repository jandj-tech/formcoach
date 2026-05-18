'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import TopNav from '@/components/TopNav'
import PasswordInput from '@/components/PasswordInput'

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
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-black py-3 rounded-xl transition-colors"
              >
                {status === 'loading' ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </div>
        </div>
      </main>
    )
  }

  // Application submitted confirmation
  if (applied) {
    return (
      <main className="min-h-screen bg-white flex flex-col">
        <TopNav />
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm text-center space-y-4">
            <div className="text-5xl">✅</div>
            <h1 className="text-2xl font-black text-black">Application submitted</h1>
            <p className="text-gray-500 text-sm">
              We&apos;ll review your application and send a setup link to <strong>{email}</strong> if approved.
            </p>
          </div>
        </div>
      </main>
    )
  }

  // Default — application form
  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="text-4xl">🏀</div>
            <h1 className="text-2xl font-black text-black">Apply for an organization account</h1>
            <p className="text-gray-500 text-sm">Tell us about your organization and we&apos;ll be in touch.</p>
          </div>
          <form onSubmit={handleApply} className="space-y-4">
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
              <label className="block text-sm font-semibold text-gray-700 mb-1">Number of players in your club</label>
              <input
                type="number"
                min={1}
                value={playerCount}
                onChange={e => setPlayerCount(e.target.value)}
                placeholder="e.g. 45"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500"
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-black py-3 rounded-xl transition-colors"
            >
              {status === 'loading' ? 'Submitting…' : 'Submit application'}
            </button>
          </form>
        </div>
      </div>
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
