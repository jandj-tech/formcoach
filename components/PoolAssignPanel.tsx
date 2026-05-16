'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface PlayerOption {
  id: string
  label: string
}

interface Props {
  /** API route that assigns pooled tokens to players. */
  endpoint: string
  /** Sent in the request body when an org admin assigns for a specific team. */
  teamId?: string
  /** Unassigned tokens currently in the team pool. */
  tokenPool: number
  /** Players eligible to receive tokens. */
  players: PlayerOption[]
}

// Shown for an initiated team: assign pooled tokens to players.
export default function PoolAssignPanel({ endpoint, teamId, tokenPool, players }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [tokensEach, setTokensEach] = useState(1)
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState('')

  const selectedIds = players.filter(p => selected[p.id]).map(p => p.id)
  const total = selectedIds.length * tokensEach

  function toggle(id: string) {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }))
  }

  async function assign() {
    if (selectedIds.length === 0) {
      setError('Select at least one player')
      return
    }
    if (total > tokenPool) {
      setError(`Only ${tokenPool} token${tokenPool !== 1 ? 's' : ''} left in the pool`)
      return
    }
    setAssigning(true)
    setError('')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerUserIds: selectedIds, tokensEach, ...(teamId ? { teamId } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not assign tokens')
        setAssigning(false)
        return
      }
      setSelected({})
      setAssigning(false)
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setAssigning(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-black text-black">Team token pool</p>
        <span className="text-sm font-bold bg-orange-100 text-orange-700 px-3 py-1 rounded-full">
          {tokenPool} token{tokenPool !== 1 ? 's' : ''}
        </span>
      </div>
      <p className="text-sm text-gray-600">
        Assign pooled tokens to players — each token is one AI shot analysis.
      </p>

      {tokenPool === 0 ? (
        <p className="text-sm text-gray-400">The pool is empty. Buy more tokens to refill it.</p>
      ) : players.length === 0 ? (
        <p className="text-sm text-gray-400">No players have joined yet.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Tokens per player</span>
            {[1, 2, 5].map(q => (
              <button
                key={q}
                onClick={() => setTokensEach(q)}
                className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${
                  tokensEach === q
                    ? 'bg-orange-500 text-white'
                    : 'bg-white border border-gray-300 text-black hover:border-orange-400'
                }`}
              >
                {q}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            {players.map(p => (
              <label key={p.id} className="flex items-center gap-3 py-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!selected[p.id]}
                  onChange={() => toggle(p.id)}
                  className="w-4 h-4 accent-orange-500"
                />
                <span className="flex-1 text-sm text-black">{p.label}</span>
              </label>
            ))}
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            onClick={assign}
            disabled={assigning || total === 0 || total > tokenPool}
            className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            {assigning ? 'Assigning...' : `Assign ${total} token${total !== 1 ? 's' : ''}`}
          </button>
        </>
      )}
    </div>
  )
}
