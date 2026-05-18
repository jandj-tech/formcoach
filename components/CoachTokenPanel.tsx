'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface CoachPlayerOpt {
  id: string
  label: string
}

// A coach's credit balance, with the option to hand credits to players as
// analysis tokens. The coach can also spend credits on their own uploads.
export default function CoachTokenPanel({
  credits,
  players,
}: {
  credits: number
  players: CoachPlayerOpt[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [each, setEach] = useState(1)

  const selectedCount = players.filter((p) => sel[p.id]).length

  async function giveToPlayers() {
    const ids = players.filter((p) => sel[p.id]).map((p) => p.id)
    if (ids.length === 0) {
      setMsg('Select at least one player')
      return
    }
    const amt = Math.max(1, each)
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch('/api/team/assign-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerUserIds: ids, tokensEach: amt }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg(data.error || 'Could not give tokens')
        setBusy(false)
        return
      }
      setMsg(`Gave ${amt} token${amt !== 1 ? 's' : ''} to ${ids.length} player${ids.length !== 1 ? 's' : ''}.`)
      setSel({})
      router.refresh()
    } catch {
      setMsg('Something went wrong. Please try again.')
    }
    setBusy(false)
  }

  return (
    <div className="bg-gray-50 rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-black text-black">Your Credits</h2>
        <span className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-1.5 text-lg font-black text-black">
          {credits}
        </span>
      </div>
      <p className="text-xs text-gray-500">
        Spend credits on your own uploads, or hand them to players as analysis tokens.
      </p>

      {msg && <p className="text-sm text-orange-600 font-semibold">{msg}</p>}

      {players.length === 0 ? (
        <p className="text-xs text-gray-400">No players on your team yet.</p>
      ) : (
        <>
          <div className="max-h-44 overflow-auto border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white">
            {players.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-orange-50"
              >
                <input
                  type="checkbox"
                  checked={!!sel[p.id]}
                  onChange={() => setSel((s) => ({ ...s, [p.id]: !s[p.id] }))}
                  className="w-4 h-4 accent-orange-500"
                />
                <span className="text-sm text-black truncate">{p.label}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Tokens each</span>
            <input
              type="number"
              min={1}
              value={each || ''}
              onChange={(e) => {
                const n = parseInt(e.target.value)
                setEach(Number.isNaN(n) ? 0 : Math.min(1000, Math.max(0, n)))
              }}
              onBlur={() => { if (each < 1) setEach(1) }}
              className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-center text-black text-sm focus:outline-none focus:border-orange-500"
            />
            <button
              type="button"
              onClick={giveToPlayers}
              disabled={busy || selectedCount === 0}
              className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-1.5 rounded-xl text-sm transition-colors"
            >
              Give to {selectedCount} selected
            </button>
          </div>
        </>
      )}
    </div>
  )
}
