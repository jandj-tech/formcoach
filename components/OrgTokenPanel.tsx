'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface OrgPlayerOpt {
  id: string
  label: string
  team: string
  teamId: string
}

export interface OrgCoachOpt {
  email: string
  label: string
}

export interface OrgTeamOpt {
  id: string
  name: string
  coachName: string
  ageGroup: string | null
  initiated: boolean
  memberCount: number
}

export default function OrgTokenPanel({
  balance,
  players,
  coaches,
  teams,
  totalPlayerTokens,
  totalCoachCredits,
}: {
  balance: number
  players: OrgPlayerOpt[]
  coaches: OrgCoachOpt[]
  teams: OrgTeamOpt[]
  totalPlayerTokens: number
  totalCoachCredits: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const [buyQty, setBuyQty] = useState(10)
  const [customQty, setCustomQty] = useState('')

  const [assignTeamId, setAssignTeamId] = useState(teams[0]?.id ?? '')
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set())
  const [assignEach, setAssignEach] = useState(1)

  const [coachEmail, setCoachEmail] = useState(coaches[0]?.email ?? '')
  const [giveQty, setGiveQty] = useState(1)

  const anyInitiated = teams.some(t => t.initiated)
  const pricePerToken = anyInitiated ? 1.49 : 2.79
  const buyTotal = (buyQty * pricePerToken).toFixed(2)

  const teamPlayers = players.filter(p => p.teamId === assignTeamId)
  const needed = selectedPlayerIds.size * assignEach
  const balanceTooLow = selectedPlayerIds.size > 0 && balance < needed

  function togglePlayer(id: string) {
    setSelectedPlayerIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllPlayers() {
    if (selectedPlayerIds.size === teamPlayers.length) {
      setSelectedPlayerIds(new Set())
    } else {
      setSelectedPlayerIds(new Set(teamPlayers.map(p => p.id)))
    }
  }

  async function buyTokens() {
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch('/api/org/buy-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: Math.max(1, buyQty) }),
      })
      const data = await res.json()
      if (data.url) { window.location.href = data.url; return }
      setMsg(data.error || 'Could not start checkout')
    } catch { setMsg('Something went wrong. Please try again.') }
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
      if (!res.ok) { setMsg(data.error || 'Something went wrong'); setBusy(false); return }
      setMsg(okMsg)
      router.refresh()
    } catch { setMsg('Something went wrong. Please try again.') }
    setBusy(false)
  }

  function assignToPlayers() {
    const ids = [...selectedPlayerIds]
    if (ids.length === 0) { setMsg('Select at least one player'); return }
    if (balanceTooLow) { setMsg(`Balance too low — need ${needed} tokens, have ${balance}`); return }
    const amt = Math.max(1, assignEach)
    post(
      '/api/org/assign-balance-tokens',
      { playerUserIds: ids, tokensEach: amt },
      `Assigned ${amt} token${amt !== 1 ? 's' : ''} to ${ids.length} player${ids.length !== 1 ? 's' : ''}.`,
    )
    setSelectedPlayerIds(new Set())
  }

  function giveToCoach() {
    if (!coachEmail) { setMsg('Pick a coach'); return }
    const amt = Math.max(1, giveQty)
    post(
      '/api/org/give-coach-credits',
      { coachEmail, quantity: amt },
      `Gave ${amt} credit${amt !== 1 ? 's' : ''} to the coach.`,
    )
  }

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 bg-gray-50 hover:bg-orange-50 transition-colors text-left"
      >
        <div>
          <h2 className="text-xl font-black text-black">Your Tokens</h2>
          <p className="text-sm text-gray-500 mt-0.5">Org token balance &amp; distribution</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-1.5 text-right">
            <p className="text-xs text-gray-500">Balance</p>
            <p className="text-lg font-black text-black">{balance}</p>
          </div>
          <span className="text-gray-400 text-sm">{open ? '−' : '+'}</span>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-3 space-y-5">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
              <p className="text-xs text-gray-500">Your balance</p>
              <p className="text-2xl font-black text-black">{balance}</p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
              <p className="text-xs text-gray-500">Player tokens</p>
              <p className="text-2xl font-black text-black">{totalPlayerTokens}</p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
              <p className="text-xs text-gray-500">Coach credits</p>
              <p className="text-2xl font-black text-black">{totalCoachCredits}</p>
            </div>
          </div>

          {msg && <p className="text-sm text-orange-600 font-semibold">{msg}</p>}

          {/* Buy tokens */}
          <div className="space-y-3">
            <p className="text-sm font-bold text-black">Buy tokens</p>

            {/* Pricing notice when no team has reached 8 players */}
            {!anyInitiated && teams.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-4 space-y-3">
                <p className="text-sm font-black text-orange-900">Tokens drop to $1.49 once a team reaches 8 players</p>
                <p className="text-xs text-orange-700">Currently $2.79 each — get more players to unlock the lower price.</p>
                <div className="space-y-2 pt-1">
                  {teams.map(t => {
                    const pct = Math.min(100, (t.memberCount / 8) * 100)
                    const left = Math.max(0, 8 - t.memberCount)
                    return (
                      <div key={t.id} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-orange-800">{t.name}</p>
                          <p className="text-xs text-orange-700 shrink-0">{t.memberCount}/8</p>
                        </div>
                        <div className="w-full bg-orange-200 rounded-full h-1.5">
                          <div className="bg-orange-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        {left > 0 && (
                          <p className="text-xs text-orange-600">{left} more player{left !== 1 ? 's' : ''} to unlock $1.49</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Quantity selector — quick picks, then a clearly-labelled custom box */}
            <div className="space-y-2">
              <div className="flex gap-2">
                {[5, 10, 25].map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => { setBuyQty(q); setCustomQty('') }}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                      buyQty === q && !customQty
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white text-black border-gray-300 hover:border-orange-400'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1}
                max={10000}
                value={customQty}
                onChange={e => {
                  const v = e.target.value
                  setCustomQty(v)
                  const n = parseInt(v)
                  if (!Number.isNaN(n)) setBuyQty(Math.min(10000, Math.max(1, n)))
                }}
                onFocus={e => e.target.select()}
                placeholder="Or enter a custom amount…"
                aria-label="Custom token amount"
                className="w-full py-2.5 px-3 border border-gray-300 rounded-xl text-black text-sm placeholder:text-gray-400 placeholder:font-normal focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {buyQty} token{buyQty !== 1 ? 's' : ''} × ${pricePerToken}
                {anyInitiated && <span className="ml-1.5 text-xs text-green-600 font-semibold">$1.49 rate unlocked</span>}
              </p>
              <p className="text-lg font-black text-black">${buyTotal}</p>
            </div>

            <button
              type="button"
              onClick={buyTokens}
              disabled={busy}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-black py-3 rounded-xl transition-colors"
            >
              {busy ? 'Redirecting to checkout...' : `Buy ${buyQty} Token${buyQty !== 1 ? 's' : ''} — $${buyTotal}`}
            </button>
          </div>

          {/* Assign tokens to players */}
          <div className="space-y-2">
            <p className="text-sm font-bold text-black">Assign tokens to players</p>
            {teams.length === 0 ? (
              <p className="text-xs text-gray-400">No teams yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select team</label>
                  <select
                    value={assignTeamId}
                    onChange={e => { setAssignTeamId(e.target.value); setSelectedPlayerIds(new Set()) }}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-black bg-white focus:outline-none focus:border-orange-500"
                  >
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.coachName}{t.ageGroup ? ' ' + t.ageGroup : ''})
                      </option>
                    ))}
                  </select>
                </div>

                {teamPlayers.length === 0 ? (
                  <p className="text-xs text-gray-400">No players on this team yet.</p>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select players</label>
                      <button
                        type="button"
                        onClick={toggleAllPlayers}
                        className="text-xs font-semibold text-orange-500 hover:text-orange-400"
                      >
                        {selectedPlayerIds.size === teamPlayers.length ? 'Deselect all' : 'Select all'}
                      </button>
                    </div>
                    <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-48 overflow-y-auto">
                      {teamPlayers.map(p => (
                        <label key={p.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={selectedPlayerIds.has(p.id)}
                            onChange={() => togglePlayer(p.id)}
                            className="w-4 h-4 accent-orange-500 shrink-0"
                          />
                          <span className="text-sm text-black">{p.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Tokens each</span>
                  <input
                    type="number"
                    min={1}
                    value={assignEach || ''}
                    onChange={e => {
                      const n = parseInt(e.target.value)
                      setAssignEach(Number.isNaN(n) ? 0 : Math.min(1000, Math.max(0, n)))
                    }}
                    onBlur={() => { if (assignEach < 1) setAssignEach(1) }}
                    className="w-16 border border-gray-300 rounded-xl px-2 py-2 text-center text-black text-sm focus:outline-none focus:border-orange-500"
                  />
                  {selectedPlayerIds.size > 0 && (
                    <span className="text-xs text-gray-500">= {needed} total from balance</span>
                  )}
                </div>

                {balanceTooLow && (
                  <p className="text-sm font-semibold text-red-500">
                    Balance too low — purchase more tokens (need {needed}, have {balance})
                  </p>
                )}

                <button
                  type="button"
                  onClick={assignToPlayers}
                  disabled={busy || selectedPlayerIds.size === 0 || balanceTooLow}
                  className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
                >
                  Assign tokens
                </button>
              </div>
            )}
          </div>

          {/* Give credits to coach */}
          <div className="space-y-2">
            <p className="text-sm font-bold text-black">Give credits to a coach</p>
            {coaches.length === 0 ? (
              <p className="text-xs text-gray-400">No coaches yet.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={coachEmail}
                  onChange={e => setCoachEmail(e.target.value)}
                  className="flex-1 min-w-[10rem] border border-gray-300 rounded-xl px-3 py-2.5 text-black text-sm focus:outline-none focus:border-orange-500"
                >
                  {coaches.map(c => <option key={c.email} value={c.email}>{c.label}</option>)}
                </select>
                <input
                  type="number"
                  min={1}
                  value={giveQty || ''}
                  onChange={e => {
                    const n = parseInt(e.target.value)
                    setGiveQty(Number.isNaN(n) ? 0 : Math.min(1000, Math.max(0, n)))
                  }}
                  onBlur={() => { if (giveQty < 1) setGiveQty(1) }}
                  className="w-16 border border-gray-300 rounded-xl px-2 py-2 text-center text-black text-sm focus:outline-none focus:border-orange-500"
                />
                <button type="button" onClick={giveToCoach} disabled={busy}
                  className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors">
                  Give credits
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
