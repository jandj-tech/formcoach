'use client'

import { useState } from 'react'

export type PlayerStatus = 'active' | 'pending' | 'invited'

// Small, consistent badge for a player's account-setup state.
export function PlayerStatusBadge({ status }: { status: PlayerStatus }) {
  if (status === 'active') {
    return (
      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400 whitespace-nowrap">
        Account complete
      </span>
    )
  }
  if (status === 'invited') {
    return (
      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-ink-800 text-gray-500 dark:text-chalk-dim whitespace-nowrap">
        Invite pending
      </span>
    )
  }
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 whitespace-nowrap">
      Setup incomplete
    </span>
  )
}

// Resend the setup email for a roster-pending player. Self-contained so it can
// drop into any roster row without prop-drilling.
export function ResendSetupButton({
  endpoint,
  userId,
  extra = {},
}: {
  endpoint: string
  userId: string
  extra?: Record<string, unknown>
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  async function resend() {
    setState('sending'); setMsg('')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...extra, userId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setState('error'); setMsg(data.error || 'Could not send'); return }
      setState('sent')
      setTimeout(() => setState('idle'), 4000)
    } catch {
      setState('error'); setMsg('Could not send')
    }
  }

  if (state === 'sent') {
    return <span className="text-xs font-semibold text-green-600 dark:text-green-400">Setup email sent</span>
  }
  return (
    <button
      onClick={resend}
      disabled={state === 'sending'}
      title="Resend the account setup email"
      className="text-xs font-semibold text-ember-600 dark:text-ember-400 hover:text-ember-500 disabled:opacity-50 transition-colors"
    >
      {state === 'sending' ? 'Sending…' : state === 'error' ? (msg || 'Retry') : 'Resend setup'}
    </button>
  )
}
