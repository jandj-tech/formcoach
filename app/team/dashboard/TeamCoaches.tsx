'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Coach {
  id: string
  email: string
  pending: boolean
}

export default function TeamCoaches({
  foundingCoachEmail,
  coaches,
}: {
  foundingCoachEmail: string
  coaches: Coach[]
}) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://learnhoops.com'

  async function addCoach(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setError('')
    setInviteUrl('')
    try {
      const res = await fetch('/api/team/add-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to add coach')
        setStatus('error')
        return
      }
      setInviteUrl(`${BASE_URL}/team/coach-signup?token=${data.inviteToken}`)
      setStatus('idle')
      setEmail('')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  function copyInvite() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-black text-black">Coaches</h2>
        <button
          onClick={() => { setAddOpen(o => !o); setError(''); setInviteUrl('') }}
          className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          {addOpen ? 'Cancel' : 'Add Coach'}
        </button>
      </div>

      {addOpen && (
        <div className="border border-gray-200 rounded-2xl p-5 space-y-3">
          <p className="text-sm text-gray-500">
            Add a coach by email — you&apos;ll get a signup link to send them. They set a password and get access to this team.
          </p>
          <form onSubmit={addCoach} className="flex gap-2">
            <input
              type="email"
              required
              placeholder="Coach email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="flex-1 bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="shrink-0 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors"
            >
              {status === 'loading' ? 'Adding…' : 'Add'}
            </button>
          </form>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {inviteUrl && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-green-700">Coach added! Send them this signup link:</p>
              <div className="flex items-center gap-2">
                <span className="flex-1 text-xs font-mono text-gray-600 truncate">{inviteUrl}</span>
                <button
                  onClick={copyInvite}
                  className="shrink-0 text-sm font-semibold text-orange-500 hover:text-orange-400 transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="border border-gray-200 rounded-2xl divide-y divide-gray-100">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm font-semibold text-black truncate">{foundingCoachEmail}</span>
          <span className="shrink-0 text-xs bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded-full">Head coach</span>
        </div>
        {coaches.map(c => (
          <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm font-semibold text-black truncate">{c.email}</span>
            <span
              className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${
                c.pending ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'
              }`}
            >
              {c.pending ? 'Invite pending' : 'Coach'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
