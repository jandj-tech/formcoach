'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TopNav from '@/components/TopNav'

export default function TeamSignupPage() {
  const router = useRouter()
  const [teamName, setTeamName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [orgCode, setOrgCode] = useState('')
  const [ageGroup, setAgeGroup] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setStatus('loading')
    setError('')

    try {
      const res = await fetch('/api/team/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: teamName, email, password, orgCode, ageGroup }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Registration failed')
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
            <h1 className="text-2xl font-black text-black">Create your team</h1>
            <p className="text-gray-500 text-sm">$2.50 per upload — no monthly fee</p>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <p className="text-sm text-gray-600">
              If your team is part of an organization, your organization will add your team
              and email you a setup link. Only use this form if you&apos;re registering an
              independent team.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              required
              placeholder="Team name (e.g. Westside Hawks)"
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
            />
            <input
              type="email"
              required
              placeholder="Coach email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password (6+ characters)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
            />
            <input
              type="password"
              required
              placeholder="Confirm password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
            />
            <input
              type="text"
              placeholder="Org code — leave blank if none"
              value={orgCode}
              onChange={e => setOrgCode(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
            />
            <input
              type="text"
              placeholder="Age group, e.g. U14, Varsity"
              value={ageGroup}
              onChange={e => setAgeGroup(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold py-3 rounded-xl transition-colors"
            >
              {status === 'loading' ? 'Creating team...' : 'Create Team'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500">
            Already have a team account?{' '}
            <a href="/team/login" className="text-orange-500 hover:underline font-medium">Log in</a>
          </p>
        </div>
      </div>
    </main>
  )
}
