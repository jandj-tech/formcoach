'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { backendButton } from '@/components/backend/button-styles'

/**
 * The one action on an invite page, for a player who is already signed in.
 *
 * Name capture happens here, inline, and only when the account has no name
 * yet. It used to be a separate full-screen step after signup, which is a lot
 * of ceremony for two short fields — and it asked for them again on a second
 * team even though /api/team/join ignores the fields once a canonical name
 * exists.
 */
export default function JoinCard({
  teamCode,
  teamName,
  needsName,
}: {
  teamCode: string
  teamName: string
  needsName: boolean
}) {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [lastInitial, setLastInitial] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')

  async function join(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setError('')
    try {
      const res = await fetch('/api/team/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          needsName ? { teamCode, firstName, lastInitial } : { teamCode },
        ),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not join the team.')
        setStatus('error')
        return
      }
      router.push('/team')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  return (
    <form onSubmit={join} className="space-y-3">
      {needsName && (
        <div className="space-y-2 text-left">
          <label className="block text-xs font-bold uppercase tracking-wide text-chalk-dim">
            What should your coach call you?
          </label>
          <div className="flex gap-2">
            <input
              required
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="First name"
              autoComplete="given-name"
              className="flex-1 min-w-0 bg-ink-950 border border-courtline rounded-xl px-4 py-3 text-chalk placeholder-chalk-dim focus:outline-none focus:border-ember-400 transition-colors"
            />
            <input
              required
              maxLength={1}
              value={lastInitial}
              onChange={e => setLastInitial(e.target.value.toUpperCase())}
              placeholder="L"
              aria-label="Last initial"
              className="w-16 shrink-0 text-center bg-ink-950 border border-courtline rounded-xl px-2 py-3 text-chalk placeholder-chalk-dim focus:outline-none focus:border-ember-400 transition-colors"
            />
          </div>
          <p className="text-xs text-chalk-dim">
            Shown on your team&apos;s roster and leaderboard. Last initial only.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        className={backendButton('primary', 'w-full py-3 text-base')}
      >
        {status === 'loading' ? 'Joining…' : `Join ${teamName}`}
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  )
}
