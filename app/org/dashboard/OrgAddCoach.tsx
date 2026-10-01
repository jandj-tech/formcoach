'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { copyToClipboard } from '@/lib/copy'

// Self-contained "add a coach to this team" control for the org dashboard.
// `coachEmails` is the team's current added-coach list (lowercased).
export default function OrgAddCoach({ teamId, coachEmails }: { teamId: string; coachEmails: string[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Which half of the form the error belongs to, so it shows under that half.
  const [errorAt, setErrorAt] = useState<'invite' | 'self'>('invite')
  const [inviteUrl, setInviteUrl] = useState('')
  const [emailedTo, setEmailedTo] = useState('')
  const [coachName, setCoachName] = useState('')
  // Set when the email already had a coach password: added straight away.
  const [addedExisting, setAddedExisting] = useState('')
  const [copied, setCopied] = useState(false)
  const [selfName, setSelfName] = useState('')
  // The coach the "Coach added" note is about. Once they drop off the list
  // (removed, or the invite cancelled) the note is stale, so it clears.
  const [addedEmail, setAddedEmail] = useState('')
  const addedListed = !!addedEmail && coachEmails.includes(addedEmail)
  const [wasListed, setWasListed] = useState(false)
  if (addedListed !== wasListed) {
    setWasListed(addedListed)
    if (wasListed) reset()
  }

  const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://learnhoops.com'

  function reset() {
    setError('')
    setInviteUrl('')
    setEmailedTo('')
    setAddedExisting('')
    setAddedEmail('')
    setWasListed(false)
  }

  // mode: 'email' emails the coach the signup link; 'link' just returns it.
  async function addCoach(mode: 'email' | 'link') {
    setErrorAt('invite')
    const value = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setError('Enter the coach\u2019s email address (it should look like name@example.com).')
      return
    }
    setLoading(true)
    reset()
    try {
      const res = await fetch('/api/org/add-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, email: value, name: coachName.trim() || undefined, sendEmail: mode === 'email' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to add coach')
        setLoading(false)
        return
      }
      if (data.existingAccount) {
        setAddedExisting(value)
      } else {
        // No link for an address already used elsewhere: that coach is
        // invited by email only (lib/roster-players.ts addCoachToTeam).
        if (data.inviteToken) setInviteUrl(`${BASE_URL}/team/coach-signup?token=${data.inviteToken}`)
        if (data.emailed) setEmailedTo(value)
      }
      setAddedEmail(value.toLowerCase())
      setEmail('')
      setCoachName('')
      setLoading(false)
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  // The org owner adds themselves as a coach — no email, no separate account.
  async function addSelf() {
    setErrorAt('self')
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
      <p className="text-sm font-semibold text-black dark:text-chalk">Invite a coach</p>
      <input
        type="email"
        aria-label="Coach email"
        placeholder="Coach email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="w-full bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-lg px-3 py-2 text-black dark:text-chalk text-sm placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors"
      />
      <input
        type="text"
        aria-label="Coach name (optional)"
        placeholder="Coach name (optional) — shown to players"
        value={coachName}
        onChange={e => setCoachName(e.target.value)}
        className="w-full bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-lg px-3 py-2 text-black dark:text-chalk text-sm placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors"
      />
      <p className="text-[11px] text-gray-400 dark:text-chalk-dim">
        Already a coach on another team? They&rsquo;re added straight away and keep the password they use now.
      </p>
      <div className="flex flex-wrap gap-2">
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
          Close
        </button>
      </div>
      {error && errorAt === 'invite' && <p role="alert" className="text-red-500 text-xs">{error}</p>}

      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-gray-200 dark:bg-ink-700" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-chalk-dim">or</span>
        <div className="flex-1 h-px bg-gray-200 dark:bg-ink-700" />
      </div>
      <p className="text-sm font-semibold text-black dark:text-chalk">Coaching this team yourself?</p>
      <input
        type="text"
        aria-label="Your name"
        placeholder="Your name — shown to players"
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
        {loading ? 'Working…' : 'Add me as a coach'}
      </button>

      {error && errorAt === 'self' && <p role="alert" className="text-red-500 text-xs">{error}</p>}
      {addedExisting && (
        <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-lg p-3">
          <p className="text-xs font-semibold text-green-700 dark:text-green-400">
            Coach added. {addedExisting} already coaches another team, so they log in with the password they already use. We emailed them to let them know.
          </p>
        </div>
      )}
      {inviteUrl && (
        <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-lg p-3 space-y-1">
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
