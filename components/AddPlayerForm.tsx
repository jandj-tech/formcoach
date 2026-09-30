'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { copyToClipboard } from '@/lib/copy'
import { nameMarkupField } from '@/lib/csv'

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
  const [done, setDone] = useState<null | { message: string; link?: string; warning?: string; tone: 'ok' | 'info' }>(null)
  // Set when the team already has a same-named player without an email.
  const [nameMatch, setNameMatch] = useState(false)
  const [copied, setCopied] = useState(false)

  function resetFields() {
    setFirstName(''); setLastName(''); setEmail(''); setParentName(''); setPhone('')
    setError('')
  }

  async function submit(allowDuplicateName = false) {
    if (!firstName.trim()) { setError('Enter the player\u2019s first name.'); return }
    // The server rejects these too, but can't say which box was wrong.
    const markup = nameMarkupField({ firstName, lastName, parentName })
    if (markup) { setError(`The ${markup} can only use letters, numbers, spaces and simple punctuation like - ' . Please remove any other symbols and try again.`); return }
    setLoading(true); setError(''); setDone(null); setNameMatch(false)
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
          allowDuplicateName: allowDuplicateName || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not add the player. Please try again.'); setLoading(false); return }

      // A same-named player with no email is already here: keep the form
      // filled so "Add anyway" can resend it unchanged.
      if (data.status === 'already_on_team' && data.nameMatch) {
        setNameMatch(true)
        setDone({ message: data.message, tone: 'info', link: data.inviteUrl || undefined })
        setLoading(false)
        return
      }

      // The only link ever shown here is a name-only player's join link. A
      // setup link for an emailed player goes to their inbox, never to us.
      const link = data.status === 'invited' ? data.inviteUrl || undefined : undefined
      setDone({
        message: data.message || 'Player added.',
        link,
        warning: data.warning,
        tone: data.status === 'already_on_team' ? 'info' : 'ok',
      })
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
        No password needed. {!email.trim()
          ? 'Add an email to create their account and send results; without one they join with an invite link you share.'
          : sendEmail
            ? 'We email them a link to finish setting up their own account. The link goes only to that inbox. Brothers and sisters can share one family email; each still gets their own account.'
            : 'Their account is created now; you can send the setup email later from the roster.'}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => submit()}
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
        <div className={`rounded-lg p-3 space-y-1.5 border ${done.tone === 'ok'
          ? 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900'
          : 'bg-gray-50 dark:bg-ink-800 border-gray-200 dark:border-courtline'}`}>
          <p className={`text-xs font-semibold ${done.tone === 'ok' ? 'text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-chalk'}`}>{done.message}</p>
          {done.warning && <p className="text-xs text-amber-700 dark:text-amber-400">{done.warning}</p>}
          {done.link && (
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs text-gray-500 dark:text-chalk-dim">Join link for this player</span>
              <button onClick={() => copyLink(done.link!)} className="shrink-0 text-xs font-semibold text-ember-600 dark:text-ember-400 hover:text-ember-500 transition-colors">
                {copied ? 'Copied' : 'Copy invite link'}
              </button>
            </div>
          )}
          {nameMatch && (
            <div className="flex items-center gap-3 pt-0.5">
              <button onClick={() => submit(true)} disabled={loading} className="text-xs font-semibold text-ember-600 dark:text-ember-400 hover:text-ember-500 disabled:opacity-50">
                Add anyway (different player)
              </button>
              <button onClick={() => { setNameMatch(false); setDone(null); resetFields() }} className="text-xs font-semibold text-gray-500 dark:text-chalk-dim hover:text-gray-700">
                Don&rsquo;t add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
