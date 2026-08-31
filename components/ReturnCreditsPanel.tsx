'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Undo2Icon } from 'lucide-react'

type Source = 'personal' | 'team'

// Lets a coach on an org-linked team send credits back to the organization's
// balance — e.g. season's over, or the org wants to redistribute.
export default function ReturnCreditsPanel({
  orgName,
  personalCredits,
  teamCredits,
}: {
  orgName: string
  personalCredits: number
  teamCredits: number
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [source, setSource] = useState<Source>(() => (personalCredits > 0 ? 'personal' : 'team'))
  const [qty, setQty] = useState(1)

  const balances: Record<Source, number> = { personal: personalCredits, team: teamCredits }
  const available = balances[source]
  const amount = Math.max(1, qty)
  const tooLow = amount > available

  async function send() {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/team/return-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, quantity: amount }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || 'Could not return credits' })
        setBusy(false)
        return
      }
      setMsg({
        ok: true,
        text: `Returned ${amount} credit${amount !== 1 ? 's' : ''} to ${orgName}.`,
      })
      setQty(1)
      router.refresh()
    } catch {
      setMsg({ ok: false, text: 'Something went wrong. Please try again.' })
    }
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Send credits back to <span className="font-semibold text-gray-900">{orgName}</span>&rsquo;s
        balance so they can be redistributed across the organization.
      </p>

      {/* Source picker */}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Return from">
        {([
          { id: 'personal' as Source, label: 'My credits', balance: personalCredits },
          { id: 'team' as Source, label: 'Team credits', balance: teamCredits },
        ]).map(s => {
          const active = source === s.id
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => { setSource(s.id); setMsg(null) }}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                active
                  ? 'border-ember-500 bg-ember-50 dark:bg-ember-500/15'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <span className={`block text-sm font-semibold ${active ? 'text-ember-700 dark:text-ember-400' : 'text-gray-700'}`}>
                {s.label}
              </span>
              <span className="block text-xs text-gray-500 tabular-nums mt-0.5">
                {s.balance} available
              </span>
            </button>
          )
        })}
      </div>

      {/* Amount + send */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Amount
          <input
            type="number"
            min={1}
            max={10000}
            value={qty || ''}
            onChange={e => {
              const n = parseInt(e.target.value)
              setQty(Number.isNaN(n) ? 0 : Math.min(10000, Math.max(0, n)))
            }}
            onBlur={() => { if (qty < 1) setQty(1) }}
            className="w-20 border border-gray-200 rounded-xl px-2 py-2 text-center text-gray-900 text-sm focus:outline-none focus:border-ember-500"
          />
        </label>
        <span className="text-sm text-gray-500 flex-1 min-w-0">
          From {source === 'personal' ? 'your' : 'the team’s'}{' '}
          <span className="font-semibold text-gray-900 tabular-nums">{available}</span>
        </span>
        <button
          type="button"
          onClick={send}
          disabled={busy || tooLow || available === 0}
          className="inline-flex items-center gap-1.5 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-900 font-semibold px-4 py-2.5 rounded-xl text-sm border border-gray-300 transition-colors"
        >
          <Undo2Icon className="w-4 h-4" aria-hidden />
          {busy ? 'Returning…' : 'Return to organization'}
        </button>
      </div>

      {tooLow && available > 0 && (
        <p className="text-sm font-medium text-red-600">
          Not enough — this returns {amount}, {source === 'personal' ? 'you have' : 'the team has'} {available}.
        </p>
      )}
      {available === 0 && (
        <p className="text-sm text-gray-500">
          {source === 'personal' ? 'Your personal balance is empty.' : 'The team’s shared balance is empty.'}
        </p>
      )}
      {msg && (
        <p className={`text-sm font-medium ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>
      )}
    </div>
  )
}
