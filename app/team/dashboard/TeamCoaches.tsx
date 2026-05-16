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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [emailedTo, setEmailedTo] = useState('')
  const [copied, setCopied] = useState(false)

  const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://learnhoops.com'

  function reset() {
    setError('')
    setInviteUrl('')
    setEmailedTo('')
  }

  // mode: 'email' emails the coach the signup link; 'link' just returns it.
  async function addCoach(mode: 'email' | 'link') {
    const value = email.trim()
    if (!value || !value.includes('@')) {
      setError('Enter a valid coach email')
      return
    }
    setLoading(true)
    reset()
    try {
      const res = await fetch('/api/team/add-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, sendEmail: mode === 'email' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to add coach')
        setLoading(false)
        return
      }
      // Always keep the link available; flag if it was also emailed.
      setInviteUrl(`${BASE_URL}/team/coach-signup?token=${data.inviteToken}`)
      if (data.emailed) setEmailedTo(value)
      setEmail('')
      setLoading(false)
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
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
          onClick={() => { setAddOpen(o => !o); reset() }}
          className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          {addOpen ? 'Cancel' : 'Add Coach'}
        </button>
      </div>

      {addOpen && (
        <div className="border border-gray-200 rounded-2xl p-5 space-y-3">
          <p className="text-sm text-gray-500">
            Add a coach by email. Either email them the signup link, or just get the link to send yourself.
          </p>
          <input
            type="email"
            placeholder="Coach email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => addCoach('email')}
              disabled={loading}
              className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors"
            >
              {loading ? 'Working…' : 'Email the invite'}
            </button>
            <button
              type="button"
              onClick={() => addCoach('link')}
              disabled={loading}
              className="flex-1 bg-white border border-orange-500 text-orange-600 hover:bg-orange-50 disabled:opacity-50 font-bold px-4 py-2.5 rounded-xl text-sm transition-colors"
            >
              {loading ? 'Working…' : 'Just get the link'}
            </button>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}

          {inviteUrl && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-green-700">
                {emailedTo ? `Coach added — invite emailed to ${emailedTo}.` : 'Coach added!'}
              </p>
              <p className="text-xs text-gray-500">
                {emailedTo ? 'You can also send them this link yourself:' : 'Send them this signup link:'}
              </p>
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
