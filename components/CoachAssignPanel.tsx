'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface AssignPlayerOpt {
  id: string
  label: string
  tokens: number
}

type Source = 'personal' | 'team' | 'pool'

// One place for a coach to hand out tokens: pick which balance pays
// (personal credits, team credits, or the team token pool), pick players,
// pick an amount. Personal and team credits go through assign-credits;
// the pool has its own endpoint.
export default function CoachAssignPanel({
  personalCredits,
  teamCredits,
  tokenPool,
  players,
}: {
  personalCredits: number
  teamCredits: number
  tokenPool: number
  players: AssignPlayerOpt[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [each, setEach] = useState(1)
  // Default to the first balance that actually has something in it.
  const [source, setSource] = useState<Source>(() =>
    personalCredits > 0 ? 'personal' : teamCredits > 0 ? 'team' : tokenPool > 0 ? 'pool' : 'personal',
  )

  const balances: Record<Source, number> = {
    personal: personalCredits,
    team: teamCredits,
    pool: tokenPool,
  }
  const sourceLabels: Record<Source, string> = {
    personal: 'my credits',
    team: 'team credits',
    pool: 'the token pool',
  }

  const selectedIds = players.filter((p) => sel[p.id]).map((p) => p.id)
  const needed = selectedIds.length * Math.max(1, each)
  const available = balances[source]
  const tooLow = selectedIds.length > 0 && needed > available
  // Another balance that could cover the same handout, for the shortfall hint.
  const alternative = (['personal', 'team', 'pool'] as Source[]).find(
    (s) => s !== source && balances[s] >= needed,
  )

  function toggleAll() {
    if (selectedIds.length === players.length) setSel({})
    else setSel(Object.fromEntries(players.map((p) => [p.id, true])))
  }

  async function assign() {
    if (selectedIds.length === 0) {
      setMsg('Select at least one player')
      return
    }
    const amt = Math.max(1, each)
    if (tooLow) {
      setMsg(`Not enough in ${sourceLabels[source]} — need ${needed}, have ${available}.`)
      return
    }
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch(
        source === 'pool' ? '/api/team/assign-tokens' : '/api/team/assign-credits',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerUserIds: selectedIds,
            tokensEach: amt,
            ...(source === 'pool' ? {} : { source }),
          }),
        },
      )
      const data = await res.json()
      if (!res.ok) {
        setMsg(data.error || 'Could not give tokens')
        setBusy(false)
        return
      }
      setMsg(
        `Gave ${amt} token${amt !== 1 ? 's' : ''} to ${selectedIds.length} player${selectedIds.length !== 1 ? 's' : ''} from ${sourceLabels[source]}.`,
      )
      setSel({})
      router.refresh()
    } catch {
      setMsg('Something went wrong. Please try again.')
    }
    setBusy(false)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pay from</label>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['personal', 'My credits', 'Your own balance'],
              ['team', 'Team credits', 'Shared with the org'],
              ['pool', 'Token pool', 'Unassigned team tokens'],
            ] as Array<[Source, string, string]>
          ).map(([key, label, hint]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSource(key)}
              disabled={balances[key] === 0}
              className={`text-left border rounded-xl px-3 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                source === key
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 bg-white hover:border-orange-300'
              }`}
            >
              <p className="text-xs text-gray-500 truncate">{label}</p>
              <p className="text-lg font-black text-black">{balances[key]}</p>
              <p className="text-[10px] text-gray-400 leading-tight">{balances[key] === 0 ? 'Empty' : hint}</p>
            </button>
          ))}
        </div>
      </div>

      {players.length === 0 ? (
        <p className="text-xs text-gray-400">No players on your team yet.</p>
      ) : (
        <>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select players</label>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs font-semibold text-orange-500 hover:text-orange-400"
              >
                {selectedIds.length === players.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="max-h-48 overflow-auto border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white">
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
                  <span className="flex-1 text-sm text-black truncate">{p.label}</span>
                  <span className="text-xs text-gray-400 shrink-0">{p.tokens} token{p.tokens !== 1 ? 's' : ''}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
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
            {selectedIds.length > 0 && (
              <span className="text-xs text-gray-500">
                = {needed} total from {sourceLabels[source]}
              </span>
            )}
          </div>

          {tooLow && (
            <p className="text-sm font-semibold text-red-500">
              Not enough in {sourceLabels[source]} — need {needed}, have {available}.
              {alternative && (
                <>
                  {' '}
                  <button onClick={() => setSource(alternative)} className="underline font-bold">
                    Use {sourceLabels[alternative]} instead?
                  </button>
                </>
              )}
            </p>
          )}

          {msg && (
            <p className={`text-sm font-semibold ${msg.startsWith('Gave') ? 'text-green-600' : 'text-orange-600'}`}>
              {msg}
            </p>
          )}

          <button
            type="button"
            onClick={assign}
            disabled={busy || selectedIds.length === 0 || tooLow}
            className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            {busy
              ? 'Giving…'
              : `Give ${needed || 0} token${needed !== 1 ? 's' : ''} to ${selectedIds.length} player${selectedIds.length !== 1 ? 's' : ''}`}
          </button>
        </>
      )}
    </div>
  )
}
