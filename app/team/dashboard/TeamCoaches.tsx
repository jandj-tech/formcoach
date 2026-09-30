'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import CoachNicknameForm from './CoachNicknameForm'
import { copyToClipboard } from '@/lib/copy'
import { backendButton } from '@/components/backend/button-styles'

interface Coach {
  id: string
  email: string
  pending: boolean
  nickname: string | null
}

export default function TeamCoaches({
  foundingCoachEmail,
  foundingCoachNickname,
  coaches,
  myNickname,
}: {
  foundingCoachEmail: string
  foundingCoachNickname: string | null
  coaches: Coach[]
  myNickname: string | null
}) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [emailedTo, setEmailedTo] = useState('')
  const [coachName, setCoachName] = useState('')
  // Set when the email already had a coach password: added straight away.
  const [addedExisting, setAddedExisting] = useState('')
  const [copied, setCopied] = useState(false)

  const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://learnhoops.com'

  function reset() {
    setError('')
    setInviteUrl('')
    setEmailedTo('')
    setAddedExisting('')
  }

  // mode: 'email' emails the coach the signup link; 'link' just returns it.
  async function addCoach(mode: 'email' | 'link') {
    const value = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setError('Enter the coach\u2019s email address (it should look like name@example.com).')
      return
    }
    setLoading(true)
    reset()
    try {
      const res = await fetch('/api/team/add-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, name: coachName.trim() || undefined, sendEmail: mode === 'email' }),
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
      setEmail('')
      setCoachName('')
      setLoading(false)
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        {/* The surrounding Section is already titled "Coaches". */}
        <p className="text-sm text-gray-500 dark:text-chalk-dim">Assistant coaches and trainers log in with their own email and see this same dashboard.</p>
        <button
          onClick={() => { setAddOpen(o => !o); reset() }}
          className={backendButton(addOpen ? 'quiet' : 'secondary', 'shrink-0')}
        >
          {addOpen ? 'Cancel' : 'Add coach'}
        </button>
      </div>

      {addOpen && (
        <div className="border border-gray-200 dark:border-courtline rounded-2xl p-5 space-y-3">
          <p className="text-sm text-gray-500 dark:text-chalk-dim">
            Add a coach by email. Either email them the signup link, or just get the link to send yourself. Someone who already coaches another team is added straight away and keeps their password.
          </p>
          <input
            type="email"
            aria-label="Coach email"
            placeholder="Coach email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-2.5 text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors"
          />
          <input
            type="text"
            aria-label="Coach name (optional)"
            placeholder="Coach name (optional) — shown to players"
            value={coachName}
            onChange={e => setCoachName(e.target.value)}
            className="w-full bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-2.5 text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => addCoach('email')}
              disabled={loading}
              className="flex-1 bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-bold px-4 py-2.5 rounded-xl text-sm transition-colors"
            >
              {loading ? 'Working…' : 'Email the invite'}
            </button>
            <button
              type="button"
              onClick={() => addCoach('link')}
              disabled={loading}
              className="flex-1 bg-white dark:bg-ink-900 border border-ember-500 text-ember-600 dark:text-ember-400 hover:bg-ember-50 dark:hover:bg-ember-500/10 disabled:opacity-50 font-bold px-4 py-2.5 rounded-xl text-sm transition-colors"
            >
              {loading ? 'Working…' : 'Just get the link'}
            </button>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}

          {addedExisting && (
            <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-xl p-4">
              <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                Coach added. {addedExisting} already coaches another team, so they log in with the password they already use. We emailed them to let them know.
              </p>
            </div>
          )}

          {inviteUrl && (
            <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                {emailedTo ? `Coach added — invite emailed to ${emailedTo}.` : 'Coach added!'}
              </p>
              <p className="text-xs text-gray-500 dark:text-chalk-dim">
                {emailedTo ? 'You can also send them this link yourself:' : 'Send them this signup link:'}
              </p>
              <div className="flex items-center gap-2">
                <span className="flex-1 text-xs font-mono text-gray-600 dark:text-chalk-dim truncate">{inviteUrl}</span>
                <button
                  onClick={copyInvite}
                  className="shrink-0 text-sm font-semibold text-ember-500 hover:text-ember-400 transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="border border-gray-200 dark:border-courtline rounded-2xl divide-y divide-gray-100 dark:divide-courtline">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-black dark:text-chalk truncate">
              {foundingCoachNickname || foundingCoachEmail}
            </p>
            {foundingCoachNickname && (
              <p className="text-xs text-gray-400 dark:text-chalk-dim truncate">{foundingCoachEmail}</p>
            )}
          </div>
          <span className="shrink-0 text-xs bg-ember-100 dark:bg-ember-500/15 text-ember-700 dark:text-ember-400 font-bold px-2 py-0.5 rounded-full">Head coach</span>
        </div>
        {coaches.map(c => (
          <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-black dark:text-chalk truncate">{c.nickname || c.email}</p>
              {c.nickname && <p className="text-xs text-gray-400 dark:text-chalk-dim truncate">{c.email}</p>}
            </div>
            <span
              className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${
                c.pending ? 'bg-gray-100 dark:bg-ink-800 text-gray-500 dark:text-chalk-dim' : 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400'
              }`}
            >
              {c.pending ? 'Invite pending' : 'Coach'}
            </span>
          </div>
        ))}
      </div>

      {/* The logged-in coach's own display name — below the list it labels. */}
      <CoachNicknameForm current={myNickname} />
    </div>
  )
}
