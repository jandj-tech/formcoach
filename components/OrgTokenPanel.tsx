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

  const [assignTeamId, setAssignTeamId] = useState(teams[0]?.id ?? '')
  const [assignRecipient, setAssignRecipient] = useState('all')
  const [assignEach, setAssignEach] = useState(1)

  const [coachEmail, setCoachEmail] = useState(coaches[0]?.email ?? '')
  const [giveQty, setGiveQty] = useState(1)

  const teamPlayers = players.filter(p => p.teamId === assignTeamId)

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
    const ids = assignRecipient === 'all'
      ? teamPlayers.map(p => p.id)
      : [assignRecipient]
    if (ids.length === 0) { setMsg('No players on this team yet'); return }
    post(
      '/api/org/assign-balance-tokens',
      { playerUserIds: ids, tokensEach: assignEach },
      `Assigned ${assignEach} token${assignEach !== 1 ? 's' : ''} to ${ids.length} player${ids.length !== 1 ? 's' : ''}.`,
    )
    setAssignRecipient('all')
  }

  function giveToCoach() {
    if (!coachEmail) { setMsg('Pick a coach'); return }
    post(
      '/api/org/give-coach-credits',
      { coachEmail, quantity: giveQty },
      `Gave ${giveQty} credit${giveQty !== 1 ? 's' : ''} to the coach.`,
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
          <p className="text-sm text-gray-500 mt-0.5">Org token balance & distribution</p>
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

          <div className="space-y-2">
            <p className="text-sm font-bold text-black">Buy tokens</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={1000}
                value={buyQty}
                onChange={e => setBuyQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 border border-gray-300 rounded-xl px-2 py-2 text-center text-black text-sm focus:outline-none focus:border-orange-500"
              />
              <button type="button" onClick={buyTokens} disabled={busy}
                className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors">
                Buy tokens
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-bold text-black">Assign tokens to players</p>
            {teams.length === 0 ? (
              <p className="text-xs text-gray-400">No teams yet.</p>
            ) : (
              <div className="space-y-2">
                <select
                  value={assignTeamId}
                  onChange={e => { setAssignTeamId(e.target.value); setAssignRecipient('all') }}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-black bg-white focus:outline-none focus:border-orange-500"
                >
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.coachName}{t.ageGroup ? ' ' + t.ageGroup : ''})
                    </option>
                  ))}
                </select>
                <select
                  value={assignRecipient}
                  onChange={e => setAssignRecipient(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-black bg-white focus:outline-none focus:border-orange-500"
                >
                  <option value="all">All Players ({teamPlayers.length})</option>
                  {teamPlayers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Tokens each</span>
                  <input
                    type="number"
                    min={1}
                    value={assignEach}
                    onChange={e => setAssignEach(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 border border-gray-300 rounded-xl px-2 py-2 text-center text-black text-sm focus:outline-none focus:border-orange-500"
                  />
                  <button type="button" onClick={assignToPlayers} disabled={busy}
                    className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors">
                    Assign tokens
                  </button>
                </div>
              </div>
            )}
          </div>

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
                  value={giveQty}
                  onChange={e => setGiveQty(Math.max(1, parseInt(e.target.value) || 1))}
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
