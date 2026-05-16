'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
  orgName: string
}

export default function OrgDashboardClient({ teams, orgName }: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState<string | null>(teams[0]?.id ?? null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [quantity, setQuantity] = useState(1)
  const [buying, setBuying] = useState(false)
  const [error, setError] = useState('')

  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAgeGroup, setNewAgeGroup] = useState('')
  const [newCoachEmail, setNewCoachEmail] = useState('')
  const [addStatus, setAddStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [addError, setAddError] = useState('')
  const [addSuccessEmail, setAddSuccessEmail] = useState('')

  async function addTeam(e: React.FormEvent) {
    e.preventDefault()
    setAddStatus('loading')
    setAddError('')
    try {
      const res = await fetch('/api/org/add-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, ageGroup: newAgeGroup, coachEmail: newCoachEmail }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddError(data.error || 'Failed to add team')
        setAddStatus('error')
        return
      }
      setAddSuccessEmail(newCoachEmail)
      setAddStatus('success')
      setNewName('')
      setNewAgeGroup('')
      setNewCoachEmail('')
      setTimeout(() => router.refresh(), 2000)
    } catch {
      setAddError('Something went wrong. Please try again.')
      setAddStatus('error')
    }
  }

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

  const addTeamSection = (
    <div className="border border-gray-200 rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-black text-black">Add a Team</h2>
        <button
          onClick={() => {
            setAddOpen(o => !o)
            setAddStatus('idle')
            setAddError('')
          }}
          className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          {addOpen ? 'Cancel' : 'Add Team'}
        </button>
      </div>

      {addOpen && (
        <form onSubmit={addTeam} className="space-y-3">
          <input
            type="text"
            required
            placeholder="Team name (e.g. Westside Hawks)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
          />
          <input
            type="text"
            placeholder="Age group (optional) — e.g. U14, Varsity, JV"
            value={newAgeGroup}
            onChange={e => setNewAgeGroup(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
          />
          <input
            type="email"
            required
            placeholder="Coach email"
            value={newCoachEmail}
            onChange={e => setNewCoachEmail(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
          />
          {addError && <p className="text-red-500 text-sm">{addError}</p>}
          {addStatus === 'success' && (
            <p className="text-green-600 text-sm font-medium">
              Team added! Invite sent to {addSuccessEmail}.
            </p>
          )}
          <button
            type="submit"
            disabled={addStatus === 'loading' || addStatus === 'success'}
            className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            {addStatus === 'loading' ? 'Adding team...' : 'Add Team & Send Invite'}
          </button>
        </form>
      )}
    </div>
  )

  if (teams.length === 0) {
    return (
      <div className="space-y-4">
        {addTeamSection}
        <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
          <p className="font-semibold">No teams in {orgName} yet</p>
          <p className="text-sm mt-1">
            Add a team above to create it and email the coach a setup link.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {addTeamSection}

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
