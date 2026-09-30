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
