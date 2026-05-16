'use client'

import { useState } from 'react'

interface Member {
  id: string
  email: string
  tokens: number
}

interface TeamData {
  id: string
  name: string
  ageGroup: string | null
  accessCode: string
  members: Member[]
}

interface Props {
  teams: TeamData[]
}

export default function OrgDashboardClient({ teams }: Props) {
  const [expanded, setExpanded] = useState<string | null>(teams[0]?.id ?? null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [quantity, setQuantity] = useState(1)
  const [buying, setBuying] = useState(false)
  const [error, setError] = useState('')

  function toggleMember(userId: string) {
    setSelected(prev => ({ ...prev, [userId]: !prev[userId] }))
  }

  const selectedIds = Object.keys(selected).filter(id => selected[id])

  async function buyTokens(teamId: string, memberIds: string[]) {
    if (memberIds.length === 0) {
      setError('Select at least one player')
      return
    }
    setBuying(true)
    setError('')
    try {
      const res = await fetch('/api/org/buy-player-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerUserIds: memberIds, quantity, teamId }),
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

  if (teams.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
        <p className="font-semibold">No teams in your organization yet</p>
        <p className="text-sm mt-1">
          Share your organization code with coaches so they can link their teams.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-black text-black">Your Teams</h2>

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

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="space-y-3">
        {teams.map(team => {
          const isOpen = expanded === team.id
          const teamSelected = team.members.filter(m => selected[m.id]).map(m => m.id)
          return (
            <div key={team.id} className="border border-gray-200 rounded-2xl overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : team.id)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 bg-gray-50 hover:bg-orange-50 transition-colors text-left"
              >
                <div>
                  <p className="font-bold text-black">{team.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {team.ageGroup ? `${team.ageGroup} · ` : ''}
                    {team.members.length} player{team.members.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className="text-gray-400 text-sm">{isOpen ? '−' : '+'}</span>
              </button>

              {isOpen && (
                <div className="px-5 py-4 space-y-3">
                  {team.members.length === 0 ? (
                    <p className="text-sm text-gray-400">
                      No players have joined this team yet. Team code:{' '}
                      <span className="font-mono font-semibold text-gray-600">{team.accessCode}</span>
                    </p>
                  ) : (
                    <>
                      <div className="space-y-1">
                        {team.members.map(m => (
                          <label
                            key={m.id}
                            className="flex items-center gap-3 py-2 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={!!selected[m.id]}
                              onChange={() => toggleMember(m.id)}
                              className="w-4 h-4 accent-orange-500"
                            />
                            <span className="flex-1 text-sm text-black">{m.email}</span>
                            <span className="text-xs text-gray-400">
                              {m.tokens} token{m.tokens !== 1 ? 's' : ''}
                            </span>
                          </label>
                        ))}
                      </div>
                      <button
                        onClick={() => buyTokens(team.id, teamSelected)}
                        disabled={buying || teamSelected.length === 0}
                        className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
                      >
                        {buying
                          ? 'Redirecting...'
                          : `Buy ${quantity} token${quantity > 1 ? 's' : ''} for ${teamSelected.length} selected`}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {selectedIds.length > 1 && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-gray-600">
            {selectedIds.length} players selected across teams
          </p>
          <button
            onClick={() => buyTokens('', selectedIds)}
            disabled={buying}
            className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            {buying ? 'Redirecting...' : `Buy for all ${selectedIds.length} selected`}
          </button>
        </div>
      )}
    </div>
  )
}
