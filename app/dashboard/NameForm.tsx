'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  currentFirstName: string | null
  currentLastInitial: string | null
}

// Sets the canonical name (first + last initial) used on every team and
// certificate. Lives on the player dashboard so the player can correct a typo
// later — coaches and the org leaderboard pick up the change immediately.
export default function NameForm({ currentFirstName, currentLastInitial }: Props) {
  const router = useRouter()
  const [firstName, setFirstName] = useState(currentFirstName ?? '')
  const [lastInitial, setLastInitial] = useState(currentLastInitial ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setStatus('saving')
    setError('')
    try {
      const res = await fetch('/api/account/name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastInitial: lastInitial.trim().charAt(0).toUpperCase(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not save your name.')
        setStatus('error')
        return
      }
      setStatus('saved')
      router.refresh()
      setTimeout(() => setStatus('idle'), 2500)
    } catch {
      setError('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  const hasName = !!(currentFirstName && currentLastInitial)

  return (
    <form onSubmit={handleSave} className="space-y-3">
      <p className="text-sm text-chalk-dim">
        {hasName ? (
          <>You appear as <span className="font-semibold text-chalk">{currentFirstName} {currentLastInitial}.</span></>
        ) : (
          'Set your name once — it shows up on every team you join and on every certificate you earn.'
        )}
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          required
          maxLength={100}
          placeholder="First name"
          value={firstName}
          onChange={e => {
            const v = e.target.value
            setFirstName(v ? v.charAt(0).toUpperCase() + v.slice(1) : '')
          }}
          className="flex-1 min-w-0 bg-ink-800 border border-courtline rounded-xl px-4 py-2.5 text-chalk placeholder-chalk-dim focus:outline-none focus:border-ember-500 transition-colors"
        />
        <input
          type="text"
          required
          maxLength={1}
          placeholder="Last initial"
          value={lastInitial}
          onChange={e => setLastInitial(e.target.value.toUpperCase())}
          className="w-24 bg-ink-800 border border-courtline rounded-xl px-4 py-2.5 text-chalk placeholder-chalk-dim focus:outline-none focus:border-ember-500 transition-colors text-center"
        />
        <button
          type="submit"
          disabled={status === 'saving'}
          className="shrink-0 bg-ember-500 hover:bg-ember-400 disabled:opacity-50 text-ink-950 font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          {status === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </div>
      {status === 'saved' && <p className="text-green-400 text-sm font-semibold">Name updated everywhere!</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </form>
  )
}
