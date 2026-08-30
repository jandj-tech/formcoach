'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { copyToClipboard } from '@/lib/copy'

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
  const [selfName, setSelfName] = useState('')

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

  // The org owner adds themselves as a coach — no email, no separate account.
  async function addSelf() {
    setLoading(true)
    reset()
    try {
      const res = await fetch('/api/org/add-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, self: true, name: selfName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not add you as a coach')
        setLoading(false)
        return
      }
      setSelfName('')
      setLoading(false)
      setOpen(false)
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  function copyInvite() {
    copyToClipboard(inviteUrl, 'Invite link copied!').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); reset() }}
        className="text-sm font-semibold text-ember-500 hover:text-ember-400 transition-colors"
      >
        + Add coach
      </button>
    )
  }

  return (
    <div className="border border-gray-200 dark:border-courtline rounded-xl p-3 space-y-2">
      <input
        type="email"
        aria-label="Coach email"
        placeholder="Coach email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="w-full bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-lg px-3 py-2 text-black dark:text-chalk text-sm placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => addCoach('email')}
          disabled={loading}
          className="flex-1 bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-bold px-3 py-2 rounded-lg text-xs transition-colors"
        >
          {loading ? 'Working…' : 'Email the invite'}
        </button>
        <button
          type="button"
          onClick={() => addCoach('link')}
          disabled={loading}
          className="flex-1 bg-white dark:bg-ink-900 border border-ember-500 text-ember-600 dark:text-ember-400 hover:bg-ember-50 dark:hover:bg-ember-500/10 disabled:opacity-50 font-bold px-3 py-2 rounded-lg text-xs transition-colors"
        >
          {loading ? 'Working…' : 'Just get the link'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); reset() }}
          className="shrink-0 text-gray-400 dark:text-chalk-dim hover:text-gray-600 dark:hover:text-chalk-dim text-xs font-semibold px-2"
        >
          Cancel
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-gray-200 dark:bg-ink-700" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-chalk-dim">or</span>
        <div className="flex-1 h-px bg-gray-200 dark:bg-ink-700" />
      </div>
      <input
        type="text"
        aria-label="Your name"
        placeholder="Your name"
        value={selfName}
        onChange={e => setSelfName(e.target.value)}
        className="w-full bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-lg px-3 py-2 text-black dark:text-chalk text-sm placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors"
      />
      <button
        type="button"
        onClick={addSelf}
        disabled={loading}
        className="w-full bg-gray-100 dark:bg-ink-800 hover:bg-gray-200 dark:hover:bg-ink-700 disabled:opacity-50 text-black dark:text-chalk font-bold px-3 py-2 rounded-lg text-xs transition-colors"
      >
        {loading ? 'Working…' : 'Add myself as a coach'}
      </button>

      {error && <p className="text-red-500 text-xs">{error}</p>}
      {inviteUrl && (
        <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 rounded-lg p-3 space-y-1">
          <p className="text-xs font-semibold text-green-700 dark:text-green-400">
            {emailedTo ? `Coach added — invite emailed to ${emailedTo}.` : 'Coach added!'}
          </p>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs font-mono text-gray-600 dark:text-chalk-dim truncate">{inviteUrl}</span>
            <button
              onClick={copyInvite}
              className="shrink-0 text-xs font-semibold text-ember-500 hover:text-ember-400 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
