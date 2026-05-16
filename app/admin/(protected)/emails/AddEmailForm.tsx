'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AddEmailForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading'>('idle')
  const [error, setError] = useState('')

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setError('')
    try {
      const res = await fetch('/api/admin/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to add email')
        setStatus('idle')
        return
      }
      setEmail('')
      setStatus('idle')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setStatus('idle')
    }
  }

  return (
    <form onSubmit={add} className="flex flex-wrap items-center gap-2">
      <input
        type="email"
        required
        placeholder="Add an email address"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="flex-1 min-w-[12rem] bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition-colors"
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-700 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors"
      >
        {status === 'loading' ? 'Adding…' : 'Add email'}
      </button>
      {error && <span className="text-red-400 text-sm">{error}</span>}
    </form>
  )
}
