'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { copyToClipboard } from '@/lib/copy'

// Reusable "add one player" control for the org and coach dashboards. No
// password is asked for. With an email the player becomes a real account and
// (optionally) gets a setup email; without one they're a name-only invite the
// coach can still upload for.
export default function AddPlayerForm({
  endpoint,
  extra = {},
  compact = false,
}: {
  endpoint: string
  extra?: Record<string, unknown>
  compact?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [parentName, setParentName] = useState('')
  const [phone, setPhone] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<null | { message: string; link?: string }>(null)
  const [copied, setCopied] = useState(false)

  function resetFields() {
    setFirstName(''); setLastName(''); setEmail(''); setParentName(''); setPhone('')
    setError('')
  }

  async function submit() {
    if (!firstName.trim()) { setError('Enter the player’s first name'); return }
    setLoading(true); setError(''); setDone(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...extra,
          firstName: firstName.trim(),
          lastName: lastName.trim() || undefined,
          email: email.trim() || undefined,
          parentName: parentName.trim() || undefined,
          phone: phone.trim() || undefined,
          sendEmail,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not add player'); setLoading(false); return }

      let message = ''
      if (data.status === 'created') message = data.emailed ? `Added — setup email sent to ${email.trim()}.` : 'Player added.'
      else if (data.status === 'linked') message = 'Added — this player already had an account, now on this team.'
      else if (data.status === 'already_on_team') message = 'That player is already on this team.'
      else if (data.status === 'invited') message = 'Player added — share their invite link to finish signup.'
      else message = 'Player added.'

      setDone({ message, link: data.setupUrl || data.inviteUrl || undefined })
      resetFields()
      setLoading(false)
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  function copyLink(link: string) {
    copyToClipboard(link, 'Link copied!').then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setDone(null); setError('') }}
        className="text-sm font-semibold text-ember-500 hover:text-ember-400 transition-colors"
      >
        + Add a player
      </button>
    )
  }

  const inputCls =
    'w-full bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-lg px-3 py-2 text-black dark:text-chalk text-sm placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors'

  return (
    <div className="border border-gray-200 dark:border-courtline rounded-xl p-3 space-y-2">
      <div className={compact ? 'space-y-2' : 'grid grid-cols-1 sm:grid-cols-2 gap-2'}>
        <input aria-label="Player first name" placeholder="First name *" value={firstName} onChange={e => setFirstName(e.target.value)} className={inputCls} />
        <input aria-label="Player last name" placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)} className={inputCls} />
        <input aria-label="Email" type="email" placeholder="Email (optional)" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
        <input aria-label="Parent name" placeholder="Parent name (optional)" value={parentName} onChange={e => setParentName(e.target.value)} className={inputCls} />
        <input aria-label="Phone" placeholder="Phone (optional)" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} />
      </div>

      {email.trim() && (
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-chalk-dim cursor-pointer">
          <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} className="w-4 h-4 accent-ember-500" />
          Email them a link to finish setting up their account
        </label>
      )}
      <p className="text-[11px] text-gray-400 dark:text-chalk-dim">
        No password needed. {email.trim() ? 'With an email, the player gets their own account and can be matched automatically when they sign up.' : 'Add an email to create their account and track progress; without one they join by invite link.'}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="flex-1 bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-bold px-3 py-2 rounded-lg text-sm transition-colors"
        >
          {loading ? 'Adding…' : 'Add player'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setDone(null); setError('') }}
          className="shrink-0 text-gray-400 dark:text-chalk-dim hover:text-gray-600 dark:hover:text-chalk-dim text-sm font-semibold px-2"
        >
          Close
        </button>
      </div>

      {error && <p className="text-red-500 text-xs">{error}</p>}
      {done && (
        <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-lg p-3 space-y-1">
          <p className="text-xs font-semibold text-green-700 dark:text-green-400">{done.message}</p>
          {done.link && (
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs font-mono text-gray-600 dark:text-chalk-dim truncate">{done.link}</span>
              <button onClick={() => copyLink(done.link!)} className="shrink-0 text-xs font-semibold text-ember-500 hover:text-ember-400 transition-colors">
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
