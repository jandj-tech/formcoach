'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// Shown right after a player signs up via a team link (/signup?teamCode=...).
// They land on /dashboard?joinTeam=CODE. If the player already has a canonical
// name set, we auto-join silently. If not, we collect first/last initial — the
// join endpoint stores them on the user record and they'll appear automatically
// on every team they join from then on.
export default function JoinTeamPopup({
  hasTeam, hasName,
}: { hasTeam: boolean; hasName: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const teamCode = searchParams.get('joinTeam')?.trim() || ''

  const [open, setOpen] = useState(true)
  const [firstName, setFirstName] = useState('')
  const [lastInitial, setLastInitial] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')
  // Guard so the auto-join effect fires once per mount.
  const autoJoined = useRef(false)

  const shouldShow = teamCode && !hasTeam && open

  async function performJoin(payload: { teamCode: string; firstName?: string; lastInitial?: string }) {
    setStatus('loading')
    setError('')
    try {
      const res = await fetch('/api/team/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  // Auto-join when the player already has a name on file — no friction.
  useEffect(() => {
    if (!shouldShow || !hasName || autoJoined.current) return
    autoJoined.current = true
    performJoin({ teamCode })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShow, hasName, teamCode])

  if (!shouldShow) return null

  function dismiss() {
    setOpen(false)
    router.replace('/dashboard')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await performJoin({
      teamCode,
      firstName: firstName.trim(),
      lastInitial: lastInitial.trim().charAt(0).toUpperCase(),
    })
  }

  // While auto-joining a name-set player, show a brief status modal.
  if (hasName) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
        <div className="bg-white dark:bg-ink-900 rounded-2xl p-6 w-full max-w-sm space-y-3 text-center">
          <div className="text-4xl">🏀</div>
          <h2 className="text-xl font-black text-black dark:text-chalk">
            {status === 'error' ? 'Could not join' : 'Joining your team…'}
          </h2>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {status === 'error' && (
            <button
              onClick={dismiss}
              className="bg-orange-500 hover:bg-orange-400 text-ink-950 font-bold py-2.5 px-5 rounded-xl transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    )
  }

  // First-time player without a saved name — collect it once, then join.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-white dark:bg-ink-900 rounded-2xl p-6 w-full max-w-sm space-y-4">
        <div className="text-center space-y-1">
          <div className="text-4xl">🏀</div>
          <h2 className="text-xl font-black text-black dark:text-chalk">Join your team</h2>
          <p className="text-sm text-gray-500 dark:text-chalk-dim">
            Set your name once — it’ll be used on every team you join from now on.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            required
            aria-label="First name"
            placeholder="First name"
            value={firstName}
            onChange={(e) => {
              const v = e.target.value
              setFirstName(v ? v.charAt(0).toUpperCase() + v.slice(1) : '')
            }}
            className="w-full bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-3 text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
          />
          <input
            type="text"
            required
            maxLength={1}
            aria-label="Last name initial"
            placeholder="Last name initial"
            value={lastInitial}
            onChange={(e) => setLastInitial(e.target.value.toUpperCase())}
            className="w-full bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-3 text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="flex-1 text-gray-500 dark:text-chalk-dim hover:text-gray-700 dark:hover:text-chalk-dim font-semibold py-3 rounded-xl transition-colors"
            >
              Skip for now
            </button>
            <button
              type="submit"
              disabled={status === 'loading'}
              className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-ink-950 font-bold py-3 rounded-xl transition-colors"
            >
              {status === 'loading' ? 'Joining…' : 'Save & Join'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
