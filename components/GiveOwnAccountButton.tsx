'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// "Give own account" for a name-only player who is emailed at a sibling's
// family address: creates their own account on that email, moves their shots
// to it and emails the setup link to that inbox (never to us). Used on the
// coach and org roster rows.
export default function GiveOwnAccountButton({
  endpoint,
  pendingId,
  playerName,
  email,
  extra = {},
}: {
  endpoint: string
  pendingId: string
  playerName: string
  email: string
  extra?: Record<string, unknown>
}) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  async function give() {
    if (!confirm(
      `Give ${playerName} their own account on ${email}?\n\n` +
      `We email that inbox a link to set up ${playerName}'s account, and ${playerName}'s shots on this team move to it. ` +
      `Anyone else on that email keeps their own account.`,
    )) return
    setState('working'); setMsg('')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...extra, pendingId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setState('error'); setMsg(data.error || 'Could not create the account.'); return }
      setState('done'); setMsg(data.message || `${playerName} now has their own account.`)
    } catch {
      setState('error'); setMsg('Could not create the account.')
    }
  }

  if (state === 'done') {
    return (
      <span role="status" className="flex flex-col items-end gap-0.5 max-w-xs text-right text-xs text-green-700 dark:text-green-400">
        <span className="font-semibold">{msg}</span>
        <button onClick={() => router.refresh()} className="font-semibold text-ember-600 dark:text-ember-400 hover:text-ember-500">
          Update roster
        </button>
      </span>
    )
  }
  return (
    <>
      <button
        onClick={give}
        disabled={state === 'working'}
        title="Create this player's own account on the family email and email them the setup link"
        className="text-xs font-semibold text-ember-600 dark:text-ember-400 hover:text-ember-500 disabled:opacity-50 transition-colors shrink-0"
      >
        {state === 'working' ? 'Creating…' : 'Give own account'}
      </button>
      {state === 'error' && <span className="max-w-xs text-xs text-red-600 dark:text-red-400">{msg}</span>}
    </>
  )
}

/**
 * "Add email" for a name-only player with no email saved: turns the entry
 * into an account on that email (an existing one for this child is used),
 * moves their shots on this team to it, and emails the setup link to that
 * inbox. Same endpoint as "Give own account", with the typed email.
 */
export function AddPlayerEmailButton({
  endpoint,
  pendingId,
  playerName,
  extra = {},
}: {
  endpoint: string
  pendingId: string
  playerName: string
  extra?: Record<string, unknown>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setState('working'); setMsg('')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...extra, pendingId, email: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setState('error'); setMsg(data.error || 'Could not add the email.'); return }
      setState('done'); setMsg(data.message || `${playerName} now has an account.`)
    } catch {
      setState('error'); setMsg('Could not add the email.')
    }
  }

  if (state === 'done') {
    return (
      <span role="status" className="flex flex-col items-end gap-0.5 max-w-xs text-right text-xs text-green-700 dark:text-green-400">
        <span className="font-semibold">{msg}</span>
        <button onClick={() => router.refresh()} className="font-semibold text-ember-600 dark:text-ember-400 hover:text-ember-500">
          Update roster
        </button>
      </span>
    )
  }
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Give this player an account on their email. Their shots on this team stay with them, and the setup link goes to that inbox."
        className="text-xs font-semibold text-ember-600 dark:text-ember-400 hover:text-ember-500 transition-colors shrink-0"
      >
        Add email
      </button>
    )
  }
  return (
    <form onSubmit={save} className="flex flex-wrap items-center justify-end gap-2 basis-full sm:basis-auto">
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder={`${playerName}’s email (or a parent’s)`}
        aria-label={`Email for ${playerName}`}
        autoFocus
        className="w-56 max-w-full border border-gray-200 dark:border-courtline rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-chalk dark:bg-ink-900 placeholder:text-gray-400 focus:outline-none focus:border-ember-500"
      />
      <button
        type="submit"
        disabled={state === 'working' || !email.trim()}
        className="text-xs font-semibold text-ember-600 dark:text-ember-400 hover:text-ember-500 disabled:opacity-50 transition-colors"
      >
        {state === 'working' ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setState('idle'); setMsg('') }}
        className="text-xs font-semibold text-gray-400 dark:text-chalk-dim hover:text-gray-600 transition-colors"
      >
        Cancel
      </button>
      {state === 'error' && <span className="basis-full text-right text-xs text-red-600 dark:text-red-400">{msg}</span>}
    </form>
  )
}

/**
 * Ids of the roster members whose login email another member of the same list
 * also uses — brothers and sisters, each with their own account on one family
 * address.
 */
export function membersSharingEmail(members: ReadonlyArray<{ id: string; email: string | null }>): Set<string> {
  const byEmail = new Map<string, string[]>()
  for (const m of members) {
    const e = (m.email ?? '').trim().toLowerCase()
    if (!e) continue
    byEmail.set(e, [...(byEmail.get(e) ?? []), m.id])
  }
  const out = new Set<string>()
  for (const ids of byEmail.values()) if (new Set(ids).size > 1) ids.forEach(id => out.add(id))
  return out
}

/** Small roster note: this player's own account uses a family email. */
export function SharedEmailNote() {
  return (
    <span
      title="Their own account, on an email a brother or sister's account also uses. Each child signs in with their own password."
      className="text-xs font-semibold px-2 py-0.5 rounded-full border border-gray-200 dark:border-courtline text-gray-500 dark:text-chalk-dim whitespace-nowrap"
    >
      Shares a family email
    </span>
  )
}
