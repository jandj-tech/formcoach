'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function JoinTeamForm() {
  const router = useRouter()
  const [teamCode, setTeamCode] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastInitial, setLastInitial] = useState('')
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
        body: JSON.stringify({ teamCode, firstName, lastInitial }),
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
      <div className="flex gap-2">
        <input
          type="text"
          required
          placeholder="First name"
          value={firstName}
          onChange={e => setFirstName(e.target.value)}
          className="flex-1 bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
        />
        <input
          type="text"
          required
          maxLength={1}
          placeholder="Last initial"
          value={lastInitial}
          onChange={e => setLastInitial(e.target.value.toUpperCase())}
          className="w-28 bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
        />
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          required
          placeholder="Team code"
          value={teamCode}
          onChange={e => setTeamCode(e.target.value.toUpperCase())}
          className="flex-1 bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors font-mono tracking-wider"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-6 py-3 rounded-xl transition-colors"
        >
          {status === 'loading' ? 'Joining...' : 'Join'}
        </button>
      </div>
      {message && (
        <p className={`text-sm ${status === 'error' ? 'text-red-500' : 'text-green-600'}`}>
          {message}
        </p>
      )}
    </form>
  )
}
