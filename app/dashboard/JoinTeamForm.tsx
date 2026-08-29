'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// hasName is `true` once the player has set their canonical name on the
// dashboard. Without it the join is blocked server-side, so we surface a
// helpful inline notice instead of letting them submit a guaranteed failure.
export default function JoinTeamForm({ hasName }: { hasName: boolean }) {
  const router = useRouter()
  const [teamCode, setTeamCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    try {
      const res = await fetch('/api/team/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamCode }),
      })
      const data = await res.json()

      if (!res.ok) {
        setMessage(data.error || 'Could not join team')
        setStatus('error')
        return
      }

      setMessage(`Joined ${data.teamName}!`)
      setStatus('success')
      setTimeout(() => router.refresh(), 800)
    } catch {
      setMessage('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {!hasName && (
        <p className="text-sm text-orange-600 dark:text-ember-400 bg-orange-50 dark:bg-ember-500/10 border border-orange-200 rounded-xl px-3 py-2">
          Set your name in the Settings tab first — it’ll be used on every team you join.
        </p>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          required
          aria-label="Team code"
          placeholder="Team code"
          value={teamCode}
          onChange={e => setTeamCode(e.target.value.toUpperCase())}
          className="flex-1 min-w-0 bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-3 text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors font-mono tracking-wider"
        />
        <button
          type="submit"
          disabled={status === 'loading' || !hasName}
          className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-ink-950 font-bold px-6 py-3 rounded-xl transition-colors"
        >
          {status === 'loading' ? 'Joining...' : 'Join'}
        </button>
      </div>
      {message && (
        <p className={`text-sm ${status === 'error' ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
          {message}
        </p>
      )}
    </form>
  )
}
