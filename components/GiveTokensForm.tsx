'use client'

import { useMemo, useState } from 'react'
import { SearchIcon, UsersIcon, UserCheckIcon } from 'lucide-react'

export interface GivePlayerOpt {
  id: string
  label: string
  tokens?: number
}

/**
 * Shared "hand out tokens" form: give to the entire roster in one tap or
 * pick specific players (searchable past 6), choose an amount, see the
 * total before committing. The caller supplies the balance it draws from
 * and the actual API call — this component owns only the picking UX.
 */
export default function GiveTokensForm({
  players,
  available,
  availableLabel,
  onGive,
}: {
  players: GivePlayerOpt[]
  available: number
  /** Where the tokens come from, lowercase — e.g. "team credits". */
  availableLabel: string
  onGive: (playerIds: string[], tokensEach: number) => Promise<{ ok: boolean; text: string }>
}) {
  const [mode, setMode] = useState<'team' | 'players'>('team')
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [each, setEach] = useState(1)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? players.filter(p => p.label.toLowerCase().includes(q)) : players
  }, [players, search])

  const selectedIds = mode === 'team'
    ? players.map(p => p.id)
    : players.filter(p => sel[p.id]).map(p => p.id)
  const amount = Math.max(1, each)
  const needed = selectedIds.length * amount
  const tooLow = selectedIds.length > 0 && needed > available

  function toggleAllVisible() {
    const ids = filteredPlayers.map(p => p.id)
    const allOn = ids.length > 0 && ids.every(id => sel[id])
    setSel(prev => {
      const next = { ...prev }
      for (const id of ids) next[id] = !allOn
      return next
    })
  }

  async function give() {
    if (selectedIds.length === 0 || tooLow || busy) return
    setBusy(true)
    setMsg(null)
    const result = await onGive(selectedIds, amount)
    setMsg(result)
    if (result.ok) setSel({})
    setBusy(false)
  }

  if (players.length === 0) {
    return <p className="text-sm text-gray-400">No players have joined this team yet.</p>
  }

  return (
    <div className="space-y-3">
      {/* Who receives */}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Give to">
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'team'}
          onClick={() => { setMode('team'); setMsg(null) }}
          className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
            mode === 'team'
              ? 'border-orange-500 bg-orange-50 text-orange-700'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
          }`}
        >
          <UsersIcon className="w-4 h-4" aria-hidden />
          Entire team ({players.length})
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'players'}
          onClick={() => { setMode('players'); setMsg(null) }}
          className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
            mode === 'players'
              ? 'border-orange-500 bg-orange-50 text-orange-700'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
          }`}
        >
          <UserCheckIcon className="w-4 h-4" aria-hidden />
          Specific players
        </button>
      </div>
      {mode === 'team' && (
        <p className="text-xs text-gray-500">Every player on the roster gets the amount below.</p>
      )}

      {mode === 'players' && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-xs font-medium text-gray-500">
              {selectedIds.length} of {players.length} selected
            </span>
            <button
              type="button"
              onClick={toggleAllVisible}
              className="text-xs font-semibold text-orange-600 hover:text-orange-500"
            >
              {filteredPlayers.length > 0 && filteredPlayers.every(p => sel[p.id]) ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          {players.length > 6 && (
            <div className="relative border-b border-gray-100">
              <SearchIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search players…"
                className="w-full pl-9 pr-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
              />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
            {filteredPlayers.length === 0 && (
              <p className="text-sm text-gray-400 px-4 py-3">No players match &ldquo;{search}&rdquo;.</p>
            )}
            {filteredPlayers.map(p => (
              <label key={p.id} className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={!!sel[p.id]}
                  onChange={() => setSel(s => ({ ...s, [p.id]: !s[p.id] }))}
                  className="w-4 h-4 accent-orange-500 shrink-0"
                />
                <span className="flex-1 text-sm text-gray-900 truncate">{p.label}</span>
                {typeof p.tokens === 'number' && (
                  <span className="text-xs text-gray-400 shrink-0 tabular-nums">{p.tokens} token{p.tokens !== 1 ? 's' : ''}</span>
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Amount + summary + go */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-600 mr-1">Tokens each</span>
          {[1, 2, 5].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => setEach(n)}
              className={`w-9 h-9 rounded-lg text-sm font-semibold border transition-colors ${
                each === n
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-gray-900 border-gray-200 hover:border-orange-400'
              }`}
            >
              {n}
            </button>
          ))}
          <input
            type="number"
            min={1}
            value={each || ''}
            onChange={(e) => {
              const n = parseInt(e.target.value)
              setEach(Number.isNaN(n) ? 0 : Math.min(1000, Math.max(0, n)))
            }}
            onBlur={() => { if (each < 1) setEach(1) }}
            aria-label="Tokens per player"
            className="w-16 h-9 border border-gray-200 rounded-lg px-2 text-center text-gray-900 text-sm focus:outline-none focus:border-orange-500"
          />
        </div>
        <span className="text-sm text-gray-500 flex-1 min-w-0">
          {selectedIds.length > 0 && (
            <>
              {selectedIds.length} player{selectedIds.length !== 1 ? 's' : ''} × {amount} ={' '}
              <span className={`font-semibold tabular-nums ${tooLow ? 'text-red-600' : 'text-gray-900'}`}>{needed}</span> of {available}
            </>
          )}
        </span>
        <button
          type="button"
          onClick={give}
          disabled={busy || selectedIds.length === 0 || tooLow}
          className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          {busy
            ? 'Giving…'
            : mode === 'team'
              ? `Give ${amount} to everyone`
              : `Give ${needed || 0} token${needed !== 1 ? 's' : ''}`}
        </button>
      </div>

      {tooLow && (
        <p className="text-sm font-medium text-red-600">
          Not enough {availableLabel} — this needs {needed}, there {available === 1 ? 'is' : 'are'} {available}.
        </p>
      )}
      {msg && (
        <p className={`text-sm font-medium ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>
      )}
    </div>
  )
}
