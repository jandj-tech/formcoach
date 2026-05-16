'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Member {
  id: string
  email: string
  first_name: string | null
  last_name_initial: string | null
  tokens: number
}

interface Coach {
  id: string
  email: string
  pending: boolean
}

interface TeamData {
  id: string
  name: string
  ageGroup: string | null
  accessCode: string
  adminEmail: string
  credits: number
  members: Member[]
  coaches: Coach[]
}

interface Props {
  teams: TeamData[]
  orgName: string
}

type DestMode = 'all' | 'specific' | 'coach'

export default function OrgDashboardClient({ teams, orgName }: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState<string | null>(teams[0]?.id ?? null)
  const [destMode, setDestMode] = useState<Record<string, DestMode>>({})
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [quantity, setQuantity] = useState<Record<string, number>>({})
  const [buying, setBuying] = useState(false)
  const [error, setError] = useState<Record<string, string>>({})
  const [copiedLink, setCopiedLink] = useState<Record<string, boolean>>({})
  const [removingCoach, setRemovingCoach] = useState<string | null>(null)

  const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://learnhoops.com'

  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAgeGroup, setNewAgeGroup] = useState('')
  const [newCoachEmail, setNewCoachEmail] = useState('')
  const [addStatus, setAddStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [addError, setAddError] = useState('')
  const [addSuccessEmail, setAddSuccessEmail] = useState('')

  function getMode(teamId: string): DestMode {
    return destMode[teamId] ?? 'all'
  }

  function getQty(teamId: string): number {
    return quantity[teamId] ?? 1
  }

  function copyLink(teamId: string, accessCode: string) {
    navigator.clipboard.writeText(`${BASE_URL}/signup?teamCode=${accessCode}`).then(() => {
      setCopiedLink(prev => ({ ...prev, [teamId]: true }))
      setTimeout(() => setCopiedLink(prev => ({ ...prev, [teamId]: false })), 2000)
    })
  }

  async function removeCoach(coachId: string, pending: boolean) {
    if (!confirm(pending ? 'Cancel this coach invite?' : 'Remove this coach from the team?')) return
    setRemovingCoach(coachId)
    try {
      const res = await fetch('/api/org/remove-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId }),
      })
      if (!res.ok) throw new Error('Failed')
      router.refresh()
    } catch {
      setRemovingCoach(null)
      alert('Could not remove that coach. Please try again.')
    }
  }

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

  function memberDisplayName(m: Member) {
    if (m.first_name) {
      return `${m.first_name}${m.last_name_initial ? ' ' + m.last_name_initial + '.' : ''}`
    }
    return m.email
  }

  async function handleBuy(team: TeamData) {
    const mode = getMode(team.id)
    const qty = getQty(team.id)
    setBuying(true)
    setError(prev => ({ ...prev, [team.id]: '' }))

    try {
      if (mode === 'coach') {
        const res = await fetch('/api/org/buy-team-credits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId: team.id, quantity: qty }),
        })
        const data = await res.json()
        if (!res.ok || !data.url) {
          setError(prev => ({ ...prev, [team.id]: data.error || 'Checkout failed' }))
          setBuying(false)
          return
        }
        window.location.href = data.url
      } else {
        let playerUserIds: string[]
        if (mode === 'all') {
          playerUserIds = team.members.map(m => m.id)
          if (playerUserIds.length === 0) {
            setError(prev => ({ ...prev, [team.id]: 'No players have joined this team yet' }))
            setBuying(false)
            return
          }
        } else {
          playerUserIds = team.members.filter(m => selected[m.id]).map(m => m.id)
          if (playerUserIds.length === 0) {
            setError(prev => ({ ...prev, [team.id]: 'Select at least one player' }))
            setBuying(false)
            return
          }
        }
        const res = await fetch('/api/org/buy-player-tokens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerUserIds, quantity: qty, teamId: team.id }),
        })
        const data = await res.json()
        if (!res.ok || !data.url) {
          setError(prev => ({ ...prev, [team.id]: data.error || 'Checkout failed' }))
          setBuying(false)
          return
        }
        window.location.href = data.url
      }
    } catch {
      setError(prev => ({ ...prev, [team.id]: 'Something went wrong. Please try again.' }))
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

      <div className="space-y-3">
        {teams.map(team => {
          const isOpen = expanded === team.id
          const mode = getMode(team.id)
          const qty = getQty(team.id)
          const teamError = error[team.id]

          let buyLabel = ''
          if (mode === 'all') {
            buyLabel = `Buy ${qty} token${qty > 1 ? 's' : ''} for all ${team.members.length} player${team.members.length !== 1 ? 's' : ''}`
          } else if (mode === 'specific') {
            const selCount = team.members.filter(m => selected[m.id]).length
            buyLabel = `Buy ${qty} token${qty > 1 ? 's' : ''} for ${selCount} selected`
          } else {
            buyLabel = `Buy ${qty} coach credit${qty > 1 ? 's' : ''} ($${(qty * 2.5).toFixed(2)})`
          }

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
                    {team.credits > 0 ? ` · ${team.credits} coach credit${team.credits !== 1 ? 's' : ''}` : ''}
                  </p>
                </div>
                <span className="text-gray-400 text-sm">{isOpen ? '−' : '+'}</span>
              </button>

              {isOpen && (
                <div className="px-5 py-4 space-y-4">
                  {/* Roster — coach, players, and the player signup link */}
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Coaches</p>
                      <div className="mt-1 border border-gray-100 rounded-xl divide-y divide-gray-100">
                        <div className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="text-sm font-semibold text-black truncate">{team.adminEmail}</span>
                          <span className="shrink-0 text-xs bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded-full">Head coach</span>
                        </div>
                        {team.coaches.map(c => (
                          <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <span className="text-sm font-semibold text-black truncate">{c.email}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.pending ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                                {c.pending ? 'Invite pending' : 'Coach'}
                              </span>
                              <button
                                onClick={() => removeCoach(c.id, c.pending)}
                                disabled={removingCoach === c.id}
                                className="text-xs font-semibold text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                              >
                                {removingCoach === c.id ? '…' : c.pending ? 'Cancel' : 'Remove'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Players ({team.members.length})
                      </p>
                      {team.members.length === 0 ? (
                        <p className="text-sm text-gray-400 mt-0.5">No players have joined yet.</p>
                      ) : (
                        <div className="mt-1 border border-gray-100 rounded-xl divide-y divide-gray-100">
                          {team.members.map(m => (
                            <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                              <span className="text-sm font-semibold text-black">{memberDisplayName(m)}</span>
                              <span className="text-xs text-gray-400 truncate">{m.email}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Player signup link</p>
                      <div className="flex items-center gap-2 bg-gray-50 border border-gray-300 rounded-xl p-2.5">
                        <span className="flex-1 text-xs font-mono text-gray-600 truncate">
                          {BASE_URL}/signup?teamCode={team.accessCode}
                        </span>
                        <button
                          onClick={() => copyLink(team.id, team.accessCode)}
                          className="shrink-0 text-sm font-semibold text-orange-500 hover:text-orange-400 transition-colors"
                        >
                          {copiedLink[team.id] ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Players open this link, sign up with the code pre-filled, then enter their name to join.
                      </p>
                    </div>
                  </div>

                  {/* Destination mode picker */}
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Send tokens to</p>
                    <div className="flex gap-2 flex-wrap">
                      {(['all', 'specific', 'coach'] as DestMode[]).map(m => (
                        <button
                          key={m}
                          onClick={() => setDestMode(prev => ({ ...prev, [team.id]: m }))}
                          className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                            mode === m
                              ? 'bg-orange-500 text-white'
                              : 'bg-white border border-gray-300 text-black hover:border-orange-400'
                          }`}
                        >
                          {m === 'all' ? 'All Players' : m === 'specific' ? 'Specific Players' : 'Coach Credits'}
                        </button>
                      ))}
                    </div>
                    {mode === 'coach' && (
                      <p className="text-xs text-gray-400 mt-1">
                        Coach credits let the coach upload shots for players. Current balance: {team.credits} credit{team.credits !== 1 ? 's' : ''}.
                      </p>
                    )}
                  </div>

                  {/* Quantity picker */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">
                      {mode === 'coach' ? 'Credits' : 'Tokens per player'}
                    </span>
                    {[1, 5, 10].map(q => (
                      <button
                        key={q}
                        onClick={() => setQuantity(prev => ({ ...prev, [team.id]: q }))}
                        className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${
                          qty === q
                            ? 'bg-orange-500 text-white'
                            : 'bg-white border border-gray-300 text-black hover:border-orange-400'
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>

                  {/* Player list (specific mode) */}
                  {mode === 'specific' && (
                    team.members.length === 0 ? (
                      <p className="text-sm text-gray-400">
                        No players have joined yet. Team code:{' '}
                        <span className="font-mono font-semibold text-gray-600">{team.accessCode}</span>
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {team.members.map(m => (
                          <label key={m.id} className="flex items-center gap-3 py-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!selected[m.id]}
                              onChange={() => toggleMember(m.id)}
                              className="w-4 h-4 accent-orange-500"
                            />
                            <span className="flex-1 text-sm text-black">{memberDisplayName(m)}</span>
                            <span className="text-xs text-gray-400">
                              {m.tokens} token{m.tokens !== 1 ? 's' : ''}
                            </span>
                          </label>
                        ))}
                      </div>
                    )
                  )}

                  {/* All Players mode: show member count info */}
                  {mode === 'all' && team.members.length === 0 && (
                    <p className="text-sm text-gray-400">
                      No players have joined yet. Team code:{' '}
                      <span className="font-mono font-semibold text-gray-600">{team.accessCode}</span>
                    </p>
                  )}

                  {teamError && <p className="text-red-500 text-sm">{teamError}</p>}

                  <button
                    onClick={() => handleBuy(team)}
                    disabled={buying}
                    className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
                  >
                    {buying ? 'Redirecting...' : buyLabel}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
