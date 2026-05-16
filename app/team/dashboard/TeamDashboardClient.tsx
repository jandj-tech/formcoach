'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import BuyPlayerTokensButton from './BuyPlayerTokensButton'
import CoachUploadForm from './CoachUploadForm'

interface Team {
  id: string
  name: string
  accessCode: string
  credits: number
}

interface Member {
  id: string
  email: string
  tokens: number
}

interface LeaderboardEntry {
  id: string
  first_name: string
  last_name_initial: string
  best_score: number
  upload_count: number
}

interface ImprovedEntry {
  player_id: string
  first_name: string
  last_name_initial: string
  first_score: number
  latest_score: number
}

interface Props {
  team: Team
  leaderboard: LeaderboardEntry[]
  improved: ImprovedEntry[]
  members: Member[]
  allTeams: Array<{ id: string; name: string }>
  currentTeamId: string
  adminEmail: string
}

export default function TeamDashboardClient({
  team,
  leaderboard,
  improved,
  members,
  allTeams,
  currentTeamId,
  adminEmail,
}: Props) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [buying, setBuying] = useState(false)
  const [quantity, setQuantity] = useState(10)
  const [loggingOut, setLoggingOut] = useState(false)
  const [switching, setSwitching] = useState(false)

  async function switchTeam(teamId: string) {
    if (teamId === currentTeamId || switching) return
    setSwitching(true)
    try {
      const res = await fetch('/api/team/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, email: adminEmail }),
      })
      if (!res.ok) {
        setSwitching(false)
        return
      }
      router.push('/team/dashboard')
      router.refresh()
    } catch {
      setSwitching(false)
    }
  }

  const uploadUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/team/${team.accessCode}/upload`

  function copyLink() {
    navigator.clipboard.writeText(uploadUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function buyCredits() {
    setBuying(true)
    try {
      const res = await fetch('/api/checkout/team-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
      })
      const { url } = await res.json()
      if (url) window.location.href = url
    } catch {
      setBuying(false)
    }
  }

  async function logout() {
    setLoggingOut(true)
    await fetch('/api/team/logout', { method: 'POST' })
    router.push('/team/login')
  }

  function scoreColor(score: number) {
    if (score >= 8) return 'text-green-600'
    if (score >= 6) return 'text-orange-500'
    return 'text-red-500'
  }

  return (
    <div className="max-w-3xl mx-auto w-full px-6 py-10 space-y-10">
      {/* Team switcher */}
      {allTeams.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-500">Your teams:</span>
          <div className="flex flex-wrap gap-2">
            {allTeams.map(t => (
              <button
                key={t.id}
                onClick={() => switchTeam(t.id)}
                disabled={switching}
                className={`text-sm font-semibold rounded-lg px-3 py-1.5 border transition-colors disabled:opacity-60 ${
                  t.id === currentTeamId
                    ? 'border-orange-500 bg-orange-50 text-orange-600'
                    : 'border-gray-200 text-gray-600 hover:border-orange-500'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-black">{team.name}</h1>
          <p className="text-gray-500 text-sm mt-1">Team Dashboard</p>
        </div>
        <button
          onClick={logout}
          disabled={loggingOut}
          className="text-gray-400 hover:text-gray-600 text-sm transition-colors"
        >
          {loggingOut ? 'Logging out...' : 'Log out'}
        </button>
      </div>

      {/* Credits + Buy */}
      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Upload credits remaining</p>
            <p className="text-4xl font-black text-black">{team.credits}</p>
          </div>
          <div className="text-right space-y-2">
            <div className="flex items-center gap-2 justify-end">
              <span className="text-sm text-gray-600">Buy</span>
              <input
                type="number"
                min={1}
                max={500}
                value={quantity}
                onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-center text-black text-sm focus:outline-none focus:border-orange-500"
              />
              <span className="text-sm text-gray-600">credits</span>
            </div>
            <p className="text-xs text-gray-400 text-right">${(quantity * 2.5).toFixed(2)} total @ $2.50 each</p>
            <button
              onClick={buyCredits}
              disabled={buying}
              className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              {buying ? 'Redirecting...' : 'Buy Credits'}
            </button>
          </div>
        </div>
      </div>

      {/* Share link */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Player upload link</h2>
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
          <span className="flex-1 text-sm text-gray-700 font-mono truncate">{uploadUrl}</span>
          <button
            onClick={copyLink}
            className="shrink-0 text-sm font-semibold text-orange-500 hover:text-orange-400 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-gray-400">Share this link with your players — no login required to upload.</p>
      </div>

      {/* Coach Upload */}
      <div className="space-y-4">
        <h2 className="text-xl font-black text-black">Upload a Shot for a Player</h2>
        <p className="text-sm text-gray-500">Record a player&apos;s shot and upload it directly — uses your team credits.</p>
        <CoachUploadForm
          accessCode={team.accessCode}
          knownPlayers={leaderboard.map(e => ({ id: e.id, first_name: e.first_name, last_name_initial: e.last_name_initial }))}
        />
      </div>

      {/* Leaderboard */}
      <div className="space-y-4">
        <h2 className="text-xl font-black text-black">Team Leaderboard</h2>
        {leaderboard.length === 0 ? (
          <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
            <p className="font-semibold">No shots analyzed yet</p>
            <p className="text-sm mt-1">Share the upload link above with your players to get started.</p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Rank</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Player</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Best Score</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Uploads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leaderboard.map((entry, i) => (
                  <tr key={entry.id} className={i === 0 ? 'bg-orange-50/50' : 'bg-white'}>
                    <td className="px-4 py-3 text-sm font-bold text-gray-400">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </td>
                    <td className="px-4 py-3 font-semibold text-black">
                      {entry.first_name} {entry.last_name_initial}.
                    </td>
                    <td className={`px-4 py-3 text-right font-black text-lg ${scoreColor(entry.best_score)}`}>
                      {Number(entry.best_score).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-400">
                      {entry.upload_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Team Members */}
      <div className="space-y-4">
        <h2 className="text-xl font-black text-black">Team Members</h2>
        {members.length === 0 ? (
          <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
            <p className="font-semibold">No players have joined yet</p>
            <p className="text-sm mt-1">
              Share your team code{' '}
              <span className="font-mono font-semibold text-gray-600">{team.accessCode}</span>{' '}
              so players can join from their dashboard.
            </p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-2xl divide-y divide-gray-100">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-black">{m.email}</span>
                <span className="text-xs text-gray-400">
                  {m.tokens} token{m.tokens !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Buy Tokens for Players */}
      <div className="space-y-4">
        <h2 className="text-xl font-black text-black">Buy Tokens for Players</h2>
        <p className="text-sm text-gray-500">
          Analysis tokens let players analyze their own shots. $4.99 per token.
        </p>
        <BuyPlayerTokensButton players={members} teamCode={team.accessCode} />
      </div>

      {/* Most Improved */}
      {improved.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-black text-black">Most Improved</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {improved.map((entry) => {
              const gain = Number(entry.latest_score) - Number(entry.first_score)
              return (
                <div
                  key={entry.player_id}
                  className="border border-gray-200 rounded-2xl p-4 space-y-1"
                >
                  <p className="font-bold text-black">
                    {entry.first_name} {entry.last_name_initial}.
                  </p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400">{Number(entry.first_score).toFixed(1)}</span>
                    <span className="text-gray-300">→</span>
                    <span className="font-semibold text-black">{Number(entry.latest_score).toFixed(1)}</span>
                    <span className={`font-black ml-auto ${gain >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {gain >= 0 ? '+' : ''}{gain.toFixed(1)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
