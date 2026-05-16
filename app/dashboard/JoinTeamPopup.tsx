'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// Shown right after a player signs up via a team link (/signup?teamCode=...).
// They land on /dashboard?joinTeam=CODE and this collects their name to
// finish joining the team.
export default function JoinTeamPopup({ hasTeam }: { hasTeam: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const teamCode = searchParams.get('joinTeam')?.trim() || ''

  const [open, setOpen] = useState(true)
  const [firstName, setFirstName] = useState('')
  const [lastInitial, setLastInitial] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')

  // Only show when arriving with a join code and not already on a team.
  if (!teamCode || hasTeam || !open) return null

  function dismiss() {
    setOpen(false)
    router.replace('/dashboard')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setError('')
    try {
      const res = await fetch('/api/team/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamCode, firstName: firstName.trim(), lastInitial: lastInitial.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not join the team.')
        setStatus('error')
        return
      }
      setOpen(false)
      router.replace('/dashboard')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4">
        <div className="text-center space-y-1">
          <div className="text-4xl">🏀</div>
          <h2 className="text-xl font-black text-black">Join your team</h2>
          <p className="text-sm text-gray-500">
            Enter your name so your coach can find you on the team roster.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            required
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
          />
          <input
            type="text"
            required
            maxLength={1}
            placeholder="Last name initial"
            value={lastInitial}
            onChange={(e) => setLastInitial(e.target.value.toUpperCase())}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="flex-1 text-gray-500 hover:text-gray-700 font-semibold py-3 rounded-xl transition-colors"
            >
              Skip for now
            </button>
            <button
              type="submit"
              disabled={status === 'loading'}
              className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold py-3 rounded-xl transition-colors"
            >
              {status === 'loading' ? 'Joining…' : 'Join Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
