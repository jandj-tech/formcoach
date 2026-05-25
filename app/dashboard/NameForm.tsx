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
      <p className="text-sm text-gray-600">
        {hasName ? (
          <>You appear as <span className="font-semibold text-black">{currentFirstName} {currentLastInitial}.</span></>
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
          className="flex-1 bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
        />
        <input
          type="text"
          required
          maxLength={1}
          placeholder="Last initial"
          value={lastInitial}
          onChange={e => setLastInitial(e.target.value.toUpperCase())}
          className="w-24 bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors text-center"
        />
        <button
          type="submit"
          disabled={status === 'saving'}
          className="shrink-0 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          {status === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </div>
      {status === 'saved' && <p className="text-green-600 text-sm font-semibold">Name updated everywhere!</p>}
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </form>
  )
}
