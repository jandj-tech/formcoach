'use client'

import { useState } from 'react'
import {
  INITIATION_MIN_PLAYERS,
  INITIATION_MIN_TOKENS,
  initiationPriceCents,
} from '@/lib/team-pricing'

interface Props {
  /** API route that creates the initiation checkout session. */
  endpoint: string
  /** Sent in the request body when an org admin initiates a specific team. */
  teamId?: string
  /** Joined-player count, used to enforce the minimum before checkout. */
  playerCount: number
}

// Shown for a team that has not yet bought its initiation package.
export default function InitiationPanel({ endpoint, teamId, playerCount }: Props) {
  const [quantity, setQuantity] = useState(INITIATION_MIN_TOKENS)
  const [buying, setBuying] = useState(false)
  const [error, setError] = useState('')

  const enoughPlayers = playerCount >= INITIATION_MIN_PLAYERS
  const validQty = Number.isFinite(quantity) && quantity >= INITIATION_MIN_TOKENS
  const price = validQty ? initiationPriceCents(quantity) : 0

  async function initiate() {
    if (!validQty) {
      setError(`Choose at least ${INITIATION_MIN_TOKENS} tokens`)
      return
    }
    setBuying(true)
    setError('')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity, ...(teamId ? { teamId } : {}) }),
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

  return (
    <div className="border border-orange-200 bg-orange-50 rounded-2xl p-5 space-y-3">
      <div>
        <p className="font-black text-black">Initiate this team</p>
        <p className="text-sm text-gray-600 mt-1">
          To unlock the $1.49 token price, buy a one-time initiation package — a minimum of{' '}
          {INITIATION_MIN_TOKENS} tokens for $30 (each token beyond {INITIATION_MIN_TOKENS} is $1.49).
          Package tokens go into the team pool for you to assign to players.
        </p>
      </div>

      <p className={`text-sm font-semibold ${enoughPlayers ? 'text-green-700' : 'text-red-600'}`}>
        {enoughPlayers
          ? `✓ ${playerCount} players — meets the ${INITIATION_MIN_PLAYERS}-player minimum`
          : `${playerCount}/${INITIATION_MIN_PLAYERS} players — at least ${INITIATION_MIN_PLAYERS} must join before initiation`}
      </p>

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Tokens in package</span>
        <input
          type="number"
          min={INITIATION_MIN_TOKENS}
          value={quantity}
          onChange={e => setQuantity(Math.floor(Number(e.target.value)))}
          onBlur={() => {
            // The initiation package can never go below the 10-token minimum.
            if (!Number.isFinite(quantity) || quantity < INITIATION_MIN_TOKENS) {
              setQuantity(INITIATION_MIN_TOKENS)
            }
          }}
          className="w-24 bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-black text-sm focus:outline-none focus:border-orange-500"
        />
        <span className="text-xs text-gray-400">min {INITIATION_MIN_TOKENS}</span>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        onClick={initiate}
        disabled={buying || !enoughPlayers || !validQty}
        className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
      >
        {buying ? 'Redirecting...' : `Initiate Team — $${(price / 100).toFixed(2)}`}
      </button>
    </div>
  )
}
