'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TopNav from '@/components/TopNav'
import PasswordInput from '@/components/PasswordInput'

export default function OrgSignupPage() {
  const router = useRouter()
  const [orgName, setOrgName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
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
      const res = await fetch('/api/org/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName, email, password }),
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

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="text-4xl">🏀</div>
            <h1 className="text-2xl font-black text-black">Register your organization</h1>
            <p className="text-gray-500 text-sm">Manage all your teams in one place</p>
          </div>

          {/* Org perks */}
          <div className="space-y-2">
            {[
              { icon: '🏆', text: 'Manage multiple teams from one dashboard' },
              { icon: '📊', text: 'Track every player\'s shot analysis and progress' },
              { icon: '🎯', text: 'Buy analysis tokens for players in bulk' },
              { icon: '👥', text: 'Add coaches and assign them to teams' },
            ].map(p => (
              <div key={p.text} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                <span className="text-lg">{p.icon}</span>
                <span className="text-sm text-gray-700 font-medium">{p.text}</span>
              </div>
            ))}

            {/* Class program highlight */}
            <div className="bg-orange-500 rounded-xl px-3 py-3 text-white">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">🎓</span>
                <span className="font-black text-sm">10-Week Shooting Class — New</span>
              </div>
              <p className="text-orange-100 text-xs leading-relaxed">
                Turn your org into a coaching program. Each player gets a ball, 2 shot analyses (start &amp; final), and a personalized certificate. $50/player, $45 for 30+.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              required
              placeholder="Organization name"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
            />
            <input
              type="email"
              required
              placeholder="Admin email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
            />
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
              disabled={status === 'loading'}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold py-3 rounded-xl transition-colors"
            >
              {status === 'loading' ? 'Creating organization...' : 'Create Organization'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500">
            Already registered?{' '}
            <a href="/login" className="text-orange-500 hover:underline font-medium">Log in</a>
          </p>
        </div>
      </div>
    </main>
  )
}
