'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface OrgPlayerOpt {
  id: string
  label: string
  team: string
}

export interface OrgCoachOpt {
  email: string
  label: string
}

// Org-owned token balance: buy tokens, assign them to players, or hand them to
// a coach as credits. The org owner can also spend the balance on their own
// uploads from the Analyze page.
export default function OrgTokenPanel({
  balance,
  players,
  coaches,
}: {
  balance: number
  players: OrgPlayerOpt[]
  coaches: OrgCoachOpt[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const [buyQty, setBuyQty] = useState(10)
  const [assignSel, setAssignSel] = useState<Record<string, boolean>>({})
  const [assignEach, setAssignEach] = useState(1)
  const [coachEmail, setCoachEmail] = useState(coaches[0]?.email ?? '')
  const [giveQty, setGiveQty] = useState(1)

  const selectedCount = players.filter((p) => assignSel[p.id]).length

  async function buyTokens() {
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch('/api/org/buy-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: buyQty }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
        return
      }
      setMsg(data.error || 'Could not start checkout')
    } catch {
      setMsg('Something went wrong. Please try again.')
    }
    setBusy(false)
  }

  async function post(url: string, body: unknown, okMsg: string) {
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg(data.error || 'Something went wrong')
        setBusy(false)
        return
      }
      setMsg(okMsg)
      router.refresh()
    } catch {
      setMsg('Something went wrong. Please try again.')
    }
    setBusy(false)
  }

  function assignToPlayers() {
    const ids = players.filter((p) => assignSel[p.id]).map((p) => p.id)
    if (ids.length === 0) {
      setMsg('Select at least one player')
      return
    }
    post(
      '/api/org/assign-balance-tokens',
      { playerUserIds: ids, tokensEach: assignEach },
      `Assigned ${assignEach} token${assignEach !== 1 ? 's' : ''} to ${ids.length} player${ids.length !== 1 ? 's' : ''}.`,
    )
    setAssignSel({})
  }

  function giveToCoach() {
    if (!coachEmail) {
      setMsg('Pick a coach')
      return
    }
    post(
      '/api/org/give-coach-credits',
      { coachEmail, quantity: giveQty },
      `Gave ${giveQty} credit${giveQty !== 1 ? 's' : ''} to the coach.`,
    )
  }

  return (
    <div className="border border-gray-200 rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-black">Your Tokens</h2>
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-2 text-right">
          <p className="text-xs text-gray-500">Balance</p>
          <p className="text-2xl font-black text-black">{balance}</p>
        </div>
      </div>

      {msg && <p className="text-sm text-orange-600 font-semibold">{msg}</p>}

      {/* Buy tokens */}
      <div className="space-y-2">
        <p className="text-sm font-bold text-black">Buy tokens</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={1000}
            value={buyQty}
            onChange={(e) => setBuyQty(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-center text-black text-sm focus:outline-none focus:border-orange-500"
          />
          <button
            type="button"
            onClick={buyTokens}
            disabled={busy}
            className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-1.5 rounded-xl text-sm transition-colors"
          >
            Buy tokens
          </button>
        </div>
      </div>

      {/* Assign to players */}
      <div className="space-y-2">
        <p className="text-sm font-bold text-black">Assign tokens to players</p>
        {players.length === 0 ? (
          <p className="text-xs text-gray-400">No players in your organization yet.</p>
        ) : (
          <>
            <div className="max-h-44 overflow-auto border border-gray-100 rounded-xl divide-y divide-gray-100">
              {players.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-orange-50"
                >
                  <input
                    type="checkbox"
                    checked={!!assignSel[p.id]}
                    onChange={() => setAssignSel((s) => ({ ...s, [p.id]: !s[p.id] }))}
                    className="w-4 h-4 accent-orange-500"
                  />
                  <span className="text-sm text-black truncate">{p.label}</span>
                  <span className="text-xs text-gray-400 truncate ml-auto">{p.team}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Tokens each</span>
              <input
                type="number"
                min={1}
                value={assignEach}
                onChange={(e) => setAssignEach(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-center text-black text-sm focus:outline-none focus:border-orange-500"
              />
              <button
                type="button"
                onClick={assignToPlayers}
                disabled={busy || selectedCount === 0}
                className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-1.5 rounded-xl text-sm transition-colors"
              >
                Assign to {selectedCount} selected
              </button>
            </div>
          </>
        )}
      </div>

      {/* Give to a coach */}
      <div className="space-y-2">
        <p className="text-sm font-bold text-black">Give credits to a coach</p>
        {coaches.length === 0 ? (
          <p className="text-xs text-gray-400">No coaches in your organization yet.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={coachEmail}
              onChange={(e) => setCoachEmail(e.target.value)}
              className="flex-1 min-w-[10rem] border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm focus:outline-none focus:border-orange-500"
            >
              {coaches.map((c) => (
                <option key={c.email} value={c.email}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={giveQty}
              onChange={(e) => setGiveQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-center text-black text-sm focus:outline-none focus:border-orange-500"
            />
            <button
              type="button"
              onClick={giveToCoach}
              disabled={busy}
              className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-1.5 rounded-xl text-sm transition-colors"
            >
              Give credits
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
