'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useIsInApp } from '@/lib/useIsInApp'
import VolumeSavings, { VolumeTierList } from '@/components/VolumeSavings'
import {  analysisUnitCents,
  orderPricing,
  usd,
} from '@/lib/team-pricing'

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
  credits: number
}

export default function OrgTokenPanel({
  balance,
  players,
  coaches,
  teams,
  totalPlayerTokens,
  totalTeamCredits,
}: {
  balance: number
  players: OrgPlayerOpt[]
  coaches: OrgCoachOpt[]
  teams: OrgTeamOpt[]
  totalPlayerTokens: number
  totalTeamCredits: number
}) {
  const router = useRouter()
  const inApp = useIsInApp()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const [buyQty, setBuyQty] = useState(10)
  const [customQty, setCustomQty] = useState('')

  const [assignTeamId, setAssignTeamId] = useState(teams[0]?.id ?? '')
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set())
  const [assignEach, setAssignEach] = useState(1)
  // 'balance' = org's personal balance, 'team' = the selected team's credits.
  // Lazy init: if the org balance starts at 0 but the first team has credits,
  // default to team-credits so the form is actionable on first render.
  const [assignSource, setAssignSource] = useState<'balance' | 'team'>(() => {
    const firstTeamCredits = teams[0]?.credits ?? 0
    return balance === 0 && firstTeamCredits > 0 ? 'team' : 'balance'
  })

  const [coachEmail, setCoachEmail] = useState(coaches[0]?.email ?? '')
  const [giveQty, setGiveQty] = useState(1)

  const [allocTeamId, setAllocTeamId] = useState(teams[0]?.id ?? '')
  const [allocQty, setAllocQty] = useState(10)

  const anyInitiated = teams.some(t => t.initiated)
  const pricePerToken = analysisUnitCents(anyInitiated) / 100
  const buyBaseCents = analysisUnitCents(anyInitiated)
  const buyTotal = usd(orderPricing(buyBaseCents, buyQty).totalCents)

  const teamPlayers = players.filter(p => p.teamId === assignTeamId)
  const selectedTeam = teams.find(t => t.id === assignTeamId)
  const teamCredits = selectedTeam?.credits ?? 0
  const needed = selectedPlayerIds.size * assignEach
  const sourceTotal = assignSource === 'balance' ? balance : teamCredits
  const sourceTooLow = selectedPlayerIds.size > 0 && sourceTotal < needed

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
    const amt = Math.max(1, assignEach)
    const total = ids.length * amt
    if (sourceTooLow) {
      setMsg(
        assignSource === 'balance'
          ? `Personal balance too low — need ${total}, have ${balance}`
          : `Team credits too low — need ${total}, ${selectedTeam?.name ?? 'this team'} has ${teamCredits}`,
      )
      return
    }
    if (assignSource === 'team') {
      post(
        '/api/org/assign-from-team-credits',
        { teamId: assignTeamId, playerUserIds: ids, tokensEach: amt },
        `Assigned ${amt} credit${amt !== 1 ? 's' : ''} from team to ${ids.length} player${ids.length !== 1 ? 's' : ''}.`,
      )
    } else {
      post(
        '/api/org/assign-balance-tokens',
        { playerUserIds: ids, tokensEach: amt },
        `Assigned ${amt} token${amt !== 1 ? 's' : ''} to ${ids.length} player${ids.length !== 1 ? 's' : ''}.`,
      )
    }
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

  function allocateToTeam() {
    if (!allocTeamId) { setMsg('Pick a team'); return }
    const amt = Math.max(1, allocQty)
    if (amt > balance) { setMsg(`Balance too low — need ${amt}, have ${balance}`); return }
    post(
      '/api/org/allocate-team-credits',
      { teamId: allocTeamId, quantity: amt },
      `Allocated ${amt} credit${amt !== 1 ? 's' : ''} to the team.`,
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
              <p className="text-xs text-gray-500">Team credits</p>
              <p className="text-2xl font-black text-black">{totalTeamCredits}</p>
            </div>
          </div>

          {msg && <p className="text-sm text-orange-600 font-semibold">{msg}</p>}

          {/* Buy tokens — hidden in the iOS app; digital purchases there must use native in-app purchase */}
          {!inApp && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-black">Buy tokens</p>

            {/* Pricing notice when no team has reached 8 players */}
            {!anyInitiated && teams.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-4 space-y-3">
                <p className="text-sm font-black text-orange-900">Tokens drop to $0.99 once a team reaches 8 players</p>
                <p className="text-xs text-orange-700">Currently $1.79 each — get more players to unlock the lower price.</p>
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
                          <p className="text-xs text-orange-600">{left} more player{left !== 1 ? 's' : ''} to unlock $0.99</p>
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

            {anyInitiated && (
              <p className="text-xs text-green-600 font-semibold px-1">$0.99 team rate unlocked</p>
            )}

            <VolumeTierList baseUnitCents={buyBaseCents} className="px-1" />

            <VolumeSavings
              baseUnitCents={buyBaseCents}
              quantity={buyQty}
              label="token"
              onJump={setBuyQty}
            />

            <button
              type="button"
              onClick={buyTokens}
              disabled={busy}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-black py-3 rounded-xl transition-colors"
            >
              {busy ? 'Redirecting to checkout...' : `Buy ${buyQty} Token${buyQty !== 1 ? 's' : ''} — ${buyTotal}`}
            </button>
          </div>
          )}

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
                        {t.name} ({t.coachName}{t.ageGroup ? ' ' + t.ageGroup : ''}{t.credits > 0 ? ` · ${t.credits} team credits` : ''})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Source picker — your personal balance OR the selected
                    team's credits. Shown up front so you don't have to scroll
                    looking for team credits when your balance is empty. */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Source</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAssignSource('balance')}
                      disabled={balance === 0}
                      className={`text-left border rounded-xl px-3 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        assignSource === 'balance'
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-200 bg-white hover:border-orange-300'
                      }`}
                    >
                      <p className="text-xs text-gray-500">Your balance</p>
                      <p className="text-lg font-black text-black">{balance}</p>
                      {balance === 0 && <p className="text-[10px] text-gray-400">Buy tokens to use</p>}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignSource('team')}
                      disabled={teamCredits === 0}
                      className={`text-left border rounded-xl px-3 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        assignSource === 'team'
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-200 bg-white hover:border-orange-300'
                      }`}
                    >
                      <p className="text-xs text-gray-500 truncate">This team&apos;s credits</p>
                      <p className="text-lg font-black text-black">{teamCredits}</p>
                      {teamCredits === 0 && <p className="text-[10px] text-gray-400">Allocate or buy to fund</p>}
                    </button>
                  </div>
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
                    <span className="text-xs text-gray-500">
                      = {needed} total from {assignSource === 'balance' ? 'your balance' : "team credits"}
                    </span>
                  )}
                </div>

                {sourceTooLow && (
                  <p className="text-sm font-semibold text-red-500">
                    {assignSource === 'balance'
                      ? `Personal balance too low — need ${needed}, have ${balance}.`
                      : `Team credits too low — need ${needed}, ${selectedTeam?.name ?? 'this team'} has ${teamCredits}.`}
                    {' '}{assignSource === 'balance' && teamCredits >= needed && (
                      <button onClick={() => setAssignSource('team')} className="underline font-bold">Use team credits instead?</button>
                    )}
                    {assignSource === 'team' && balance >= needed && (
                      <button onClick={() => setAssignSource('balance')} className="underline font-bold">Use personal balance instead?</button>
                    )}
                  </p>
                )}

                <button
                  type="button"
                  onClick={assignToPlayers}
                  disabled={busy || selectedPlayerIds.size === 0 || sourceTooLow}
                  className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
                >
                  {`Assign tokens from ${assignSource === 'balance' ? 'your balance' : 'team credits'}`}
                </button>
              </div>
            )}
          </div>

          {/* Allocate credits to a team — funds teams.credits, which both the
              coach (within their team) and the org can spend. Coaches can't
              move them elsewhere; the org keeps full access. */}
          <div className="space-y-2">
            <p className="text-sm font-bold text-black">Allocate credits to a team</p>
            <p className="text-xs text-gray-500 -mt-1">
              The team&apos;s coach can spend these on coach uploads or assign them to players in this team only — you keep full access.
            </p>
            {teams.length === 0 ? (
              <p className="text-xs text-gray-400">No teams yet.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={allocTeamId}
                  onChange={e => setAllocTeamId(e.target.value)}
                  className="flex-1 min-w-[10rem] border border-gray-300 rounded-xl px-3 py-2.5 text-black text-sm focus:outline-none focus:border-orange-500"
                >
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.ageGroup ? ' · ' + t.ageGroup : ''}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={allocQty || ''}
                  onChange={e => {
                    const n = parseInt(e.target.value)
                    setAllocQty(Number.isNaN(n) ? 0 : Math.min(10000, Math.max(0, n)))
                  }}
                  onBlur={() => { if (allocQty < 1) setAllocQty(1) }}
                  className="w-20 border border-gray-300 rounded-xl px-2 py-2 text-center text-black text-sm focus:outline-none focus:border-orange-500"
                />
                <button
                  type="button"
                  onClick={allocateToTeam}
                  disabled={busy || allocQty < 1 || allocQty > balance}
                  className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
                >
                  Allocate
                </button>
              </div>
            )}
          </div>

          {/* Give credits to coach — coach's personal self-upload credits (for
              analyzing their own shots, separate from team operations). */}
          <div className="space-y-2">
            <p className="text-sm font-bold text-black">Give a coach personal upload credits</p>
            <p className="text-xs text-gray-500 -mt-1">
              For the coach analyzing their own shots — separate from team credits above.
            </p>
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
