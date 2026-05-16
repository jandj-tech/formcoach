'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Self-contained "add a coach to this team" control for the org dashboard.
export default function OrgAddCoach({ teamId }: { teamId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
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
      const res = await fetch('/api/org/add-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, email: value, sendEmail: mode === 'email' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to add coach')
        setLoading(false)
        return
      }
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

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); reset() }}
        className="text-sm font-semibold text-orange-500 hover:text-orange-400 transition-colors"
      >
        + Add coach
      </button>
    )
  }

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-2">
      <input
        type="email"
        placeholder="Coach email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-black text-sm placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => addCoach('email')}
          disabled={loading}
          className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-3 py-2 rounded-lg text-xs transition-colors"
        >
          {loading ? 'Working…' : 'Email the invite'}
        </button>
        <button
          type="button"
          onClick={() => addCoach('link')}
          disabled={loading}
          className="flex-1 bg-white border border-orange-500 text-orange-600 hover:bg-orange-50 disabled:opacity-50 font-bold px-3 py-2 rounded-lg text-xs transition-colors"
        >
          {loading ? 'Working…' : 'Just get the link'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); reset() }}
          className="shrink-0 text-gray-400 hover:text-gray-600 text-xs font-semibold px-2"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-red-500 text-xs">{error}</p>}
      {inviteUrl && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
          <p className="text-xs font-semibold text-green-700">
            {emailedTo ? `Coach added — invite emailed to ${emailedTo}.` : 'Coach added!'}
          </p>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs font-mono text-gray-600 truncate">{inviteUrl}</span>
            <button
              onClick={copyInvite}
              className="shrink-0 text-xs font-semibold text-orange-500 hover:text-orange-400 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
