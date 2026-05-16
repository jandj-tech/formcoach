'use client'

import { useState } from 'react'

interface Player {
  id: string
  email: string
  tokens: number
}

interface Props {
  players: Player[]
  teamCode: string
}

export default function BuyPlayerTokensButton({ players, teamCode }: Props) {
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [quantity, setQuantity] = useState(1)
  const [buying, setBuying] = useState(false)
  const [error, setError] = useState('')

  function toggle(userId: string) {
    setSelected(prev => ({ ...prev, [userId]: !prev[userId] }))
  }

  const selectedIds = players.filter(p => selected[p.id]).map(p => p.id)

  async function buy() {
    if (selectedIds.length === 0) {
      setError('Select at least one player')
      return
    }
    setBuying(true)
    setError('')
    try {
      const res = await fetch('/api/team/buy-player-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerUserIds: selectedIds, quantity }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setError(data.error || 'Checkout failed')
        setBuying(false)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Something went wrong. Please try again.')
      setBuying(false)
    }
  }

  if (players.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl px-4">
        <p className="font-semibold text-gray-500">No players have joined your team yet.</p>
        <p className="text-sm mt-1">
          Share your team code:{' '}
          <span className="font-mono font-semibold text-gray-600">{teamCode}</span>
        </p>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Tokens per player</span>
        {[1, 5, 10].map(q => (
          <button
            key={q}
            onClick={() => setQuantity(q)}
            className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${
              quantity === q
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
          <label key={p.id} className="flex items-center gap-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!selected[p.id]}
              onChange={() => toggle(p.id)}
              className="w-4 h-4 accent-orange-500"
            />
            <span className="flex-1 text-sm text-black">{p.email}</span>
            <span className="text-xs text-gray-400">
              {p.tokens} token{p.tokens !== 1 ? 's' : ''}
            </span>
          </label>
        ))}
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        onClick={buy}
        disabled={buying || selectedIds.length === 0}
        className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
      >
        {buying
          ? 'Redirecting...'
          : `Buy Tokens for ${selectedIds.length} Player${selectedIds.length !== 1 ? 's' : ''}`}
      </button>
    </div>
  )
}
