'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import CoachUploadForm from './CoachUploadForm'
import TeamCoaches from './TeamCoaches'
import InitiationPanel from '@/components/InitiationPanel'
import PoolAssignPanel from '@/components/PoolAssignPanel'
import TokenBalances from '@/components/TokenBalances'
import LeaderboardTable from '@/components/LeaderboardTable'
import PrintButton from '@/components/PrintButton'
import InlineEdit from '@/components/InlineEdit'
import VideoUploader from '@/components/VideoUploader'
import PlayerShotList, { type Shot } from '@/components/PlayerShotList'
import BuySelfCreditsButton from './BuySelfCreditsButton'
import { useCart } from '@/lib/cart'

interface Team {
  id: string
  name: string
  accessCode: string
  credits: number
  initiated: boolean
  tokenPool: number
}

interface LeaderboardEntry {
  id: string
  first_name: string
  last_name_initial: string
  kind: 'member' | 'player'
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

interface Member {
  id: string
  email: string
  tokens: number
  first_name: string | null
  last_name_initial: string | null
}

interface PendingMember {
  id: string
  first_name: string
  last_name_initial: string | null
  invite_token: string | null
}

interface Props {
  team: Team
  leaderboard: LeaderboardEntry[]
  improved: ImprovedEntry[]
  members: Member[]
  pendingMembers: PendingMember[]
  coaches: Array<{ id: string; email: string; pending: boolean; nickname: string | null }>
  foundingCoachEmail: string
  foundingCoachNickname: string | null
  myNickname: string | null
  allTeams: Array<{ id: string; name: string }>
  currentTeamId: string
  adminEmail: string
  fromOrg: boolean
  selfCredits: number
  myUploads: Shot[]
}

export default function TeamDashboardClient({
  team,
  leaderboard,
  improved,
  members,
  pendingMembers,
  coaches,
  foundingCoachEmail,
  foundingCoachNickname,
  myNickname,
  allTeams,
  currentTeamId,
  adminEmail,
  fromOrg,
  selfCredits,
  myUploads,
}: Props) {
  const router = useRouter()
  const { clear: clearCart } = useCart()
  const [buying, setBuying] = useState(false)
  const [quantity, setQuantity] = useState(10)
  const [loggingOut, setLoggingOut] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [showInvite, setShowInvite] = useState(true)
  const [showCoaches, setShowCoaches] = useState(true)
  const [showPlayers, setShowPlayers] = useState(true)
  const [showLeaderboardSection, setShowLeaderboardSection] = useState(true)
  const [kicking, setKicking] = useState<string | null>(null)

  // Add player form
  const [addOpen, setAddOpen] = useState(false)
  const [addFirst, setAddFirst] = useState('')
  const [addInitial, setAddInitial] = useState('')
  const [addStatus, setAddStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [addError, setAddError] = useState('')
  const [newInviteUrl, setNewInviteUrl] = useState('')
  const [copiedInvite, setCopiedInvite] = useState(false)

  // Per-pending-player invite copy state
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedSignup, setCopiedSignup] = useState(false)

  const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://learnhoops.com'
  const playerSignupLink = `${BASE_URL}/signup?teamCode=${team.accessCode}`

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
    clearCart() // The cart is per-session — empty it on logout.
    router.push('/login')
  }

  async function kickMember(userId: string) {
    if (!confirm('Remove this player from the team?')) return
    setKicking(userId)
    try {
      const res = await fetch('/api/team/remove-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) throw new Error('Failed')
      router.refresh()
    } catch {
      setKicking(null)
      alert('Could not remove that player. Please try again.')
    }
  }

  function formatPlayerName(firstName: string, lastNameInitial: string | null) {
    if (!lastNameInitial) return firstName
    if (lastNameInitial.length === 1) return `${firstName} ${lastNameInitial}.`
    return `${firstName} ${lastNameInitial}`
  }

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault()
    setAddStatus('loading')
    setAddError('')
    setNewInviteUrl('')
    try {
      const res = await fetch('/api/team/add-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: addFirst, lastInitial: addInitial }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddError(data.error || 'Failed to add player')
        setAddStatus('error')
        return
      }
      setNewInviteUrl(data.inviteUrl)
      setAddStatus('success')
      setAddFirst('')
      setAddInitial('')
      setTimeout(() => router.refresh(), 1000)
    } catch {
      setAddError('Something went wrong. Please try again.')
      setAddStatus('error')
    }
  }

  function copyInviteUrl(url: string, id: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  function copySignupLink() {
    navigator.clipboard.writeText(playerSignupLink).then(() => {
      setCopiedSignup(true)
      setTimeout(() => setCopiedSignup(false), 2000)
    })
  }

  function copyNewInviteUrl() {
    navigator.clipboard.writeText(newInviteUrl).then(() => {
      setCopiedInvite(true)
      setTimeout(() => setCopiedInvite(false), 2000)
    })
  }

  // All players available for coach upload (real members + pending by-name)
  const uploadableMembers: Member[] = [
    ...members,
    ...pendingMembers.map(p => ({
      id: p.id,
      email: '',
      tokens: 0,
      first_name: p.first_name,
      last_name_initial: p.last_name_initial,
    })),
  ]

  return (
    <div className="max-w-3xl mx-auto w-full px-6 py-10 space-y-6">
      {fromOrg && (
        <Link
          href="/org/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-500 hover:text-orange-400 transition-colors"
        >
          ← Back to organization dashboard
        </Link>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <InlineEdit
            value={team.name}
            endpoint="/api/team/rename"
            bodyKey="name"
            placeholder="Team name"
            textClassName="text-2xl font-black text-black"
          />
          <p className="text-gray-500 text-sm mt-1">
            Team Dashboard · Logged in as{' '}
            <span className="font-semibold text-gray-700">{myNickname || adminEmail}</span>
          </p>
          {allTeams.length > 1 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {allTeams.map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    if (t.id !== currentTeamId) {
                      fetch('/api/team/select', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ teamId: t.id, email: adminEmail }),
                      }).then(() => router.refresh())
                    }
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    t.id === currentTeamId
                      ? 'bg-orange-500 text-white'
                      : 'bg-white border border-gray-300 text-black hover:border-orange-400'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={logout}
          disabled={loggingOut}
          className="text-gray-400 hover:text-gray-600 text-sm transition-colors shrink-0"
        >
          {loggingOut ? 'Logging out...' : 'Log out'}
        </button>
      </div>

      {/* Credits & Pool */}
      <div className="bg-gray-50 rounded-2xl p-5 space-y-4">
        <h2 className="text-base font-black text-black">Credits &amp; Pool</h2>
        {team.initiated ? (
          <PoolAssignPanel
            endpoint="/api/team/assign-tokens"
            tokenPool={team.tokenPool}
            players={members.map(m => ({
              id: m.id,
              label: m.first_name
                ? `${m.first_name}${m.last_name_initial ? ' ' + m.last_name_initial + '.' : ''}`
                : m.email,
            }))}
          />
        ) : (
          <InitiationPanel
            endpoint="/api/team/buy-initiation"
            playerCount={members.length}
          />
        )}

        {team.initiated && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
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
        )}

        <TokenBalances
          players={members.map(m => ({
            id: m.id,
            label: m.first_name ? formatPlayerName(m.first_name, m.last_name_initial) : m.email,
            tokens: m.tokens,
          }))}
          coachCredits={team.credits}
          tokenPool={team.tokenPool}
        />
      </div>

      {/* Invite Players */}
      <div className="bg-gray-50 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-black text-black">Invite Players</h2>
          <button onClick={() => setShowInvite(o => !o)} className="text-xs font-semibold text-gray-400 hover:text-black transition-colors">
            {showInvite ? 'Hide ▲' : 'Show ▼'}
          </button>
        </div>
        {showInvite && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Team code</p>
              <p className="text-2xl font-black font-mono tracking-widest text-black mt-0.5">{team.accessCode}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Player signup link</p>
              <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-xl p-2.5">
                <span className="flex-1 text-xs font-mono text-gray-600 truncate">{playerSignupLink}</span>
                <button
                  onClick={copySignupLink}
                  className="shrink-0 text-sm font-semibold text-orange-500 hover:text-orange-400 transition-colors"
                >
                  {copiedSignup ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1.5">
                Share this link with players. They sign up, then enter their name to join your team.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Coaches */}
      <div className="bg-gray-50 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-black text-black">Coaches</h2>
          <button onClick={() => setShowCoaches(o => !o)} className="text-xs font-semibold text-gray-400 hover:text-black transition-colors">
            {showCoaches ? 'Hide ▲' : 'Show ▼'}
          </button>
        </div>
        {showCoaches && (
          <TeamCoaches
            foundingCoachEmail={foundingCoachEmail}
            foundingCoachNickname={foundingCoachNickname}
            coaches={coaches}
            myNickname={myNickname}
          />
        )}
      </div>

      {/* Upload a Shot for a Player */}
      <div className="bg-gray-50 rounded-2xl p-5 space-y-3">
        <h2 className="text-base font-black text-black">Upload a Shot for a Player</h2>
        <CoachUploadForm accessCode={team.accessCode} members={uploadableMembers} />
      </div>

      {/* My Uploads — the coach analyzes their own shot */}
      <div className="bg-gray-50 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-black text-black">My Uploads</h2>
          <span className="shrink-0 bg-orange-100 text-orange-700 text-xs font-bold px-3 py-1 rounded-full">
            {selfCredits} credit{selfCredits !== 1 ? 's' : ''}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          Analyze your own shot — each upload uses one of your credits
          {team.initiated ? ' ($2.50 each).' : ' ($4.99 each until the team is initiated).'}
        </p>
        <BuySelfCreditsButton initiated={team.initiated} />
        {selfCredits > 0 ? (
          <VideoUploader coachSelf />
        ) : (
          <p className="text-sm text-gray-400">Buy a credit above to analyze your shot.</p>
        )}
        {myUploads.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Your analyses</p>
            <PlayerShotList shots={myUploads} />
          </div>
        )}
      </div>

      {/* Players */}
      <div className="bg-gray-50 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-black text-black">Players</h2>
          <div className="flex items-center gap-2">
            {showPlayers && (
              <button
                onClick={() => { setAddOpen(o => !o); setAddStatus('idle'); setAddError(''); setNewInviteUrl('') }}
                className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-3 py-1.5 rounded-xl text-sm transition-colors"
              >
                {addOpen ? 'Cancel' : 'Add Player'}
              </button>
            )}
            <button onClick={() => setShowPlayers(o => !o)} className="text-xs font-semibold text-gray-400 hover:text-black transition-colors">
              {showPlayers ? 'Hide ▲' : 'Show ▼'}
            </button>
          </div>
        </div>

        {showPlayers && addOpen && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
            <p className="text-sm text-gray-500">
              Add a player by name. You can optionally send them a link to create their account — once they sign up, they&apos;ll be automatically added to the team under this name.
            </p>
            <form onSubmit={addPlayer} className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="First name"
                  value={addFirst}
                  onChange={e => setAddFirst(e.target.value)}
                  className="flex-1 bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
                />
                <input
                  type="text"
                  maxLength={1}
                  placeholder="Last initial"
                  value={addInitial}
                  onChange={e => setAddInitial(e.target.value.toUpperCase())}
                  className="w-20 bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
                />
              </div>
              {addError && <p className="text-red-500 text-sm">{addError}</p>}
              <button
                type="submit"
                disabled={addStatus === 'loading'}
                className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
              >
                {addStatus === 'loading' ? 'Adding...' : 'Add Player'}
              </button>
            </form>

            {addStatus === 'success' && newInviteUrl && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-green-700">Player added! Share this link so they can sign up and join the team:</p>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-xs font-mono text-gray-600 truncate">{newInviteUrl}</span>
                  <button
                    onClick={copyNewInviteUrl}
                    className="shrink-0 text-sm font-semibold text-orange-500 hover:text-orange-400 transition-colors"
                  >
                    {copiedInvite ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {showPlayers && members.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Joined with account</p>
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-3 py-2 px-3 bg-white rounded-xl border border-gray-100">
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/team/dashboard/member/${m.id}`}
                    className="block truncate text-sm font-semibold text-black hover:text-orange-600 hover:underline transition-colors"
                  >
                    {m.first_name ? formatPlayerName(m.first_name, m.last_name_initial) : m.email}
                  </Link>
                  {m.first_name && <p className="text-xs text-gray-400 truncate">{m.email}</p>}
                </div>
                <span className="shrink-0 text-xs text-gray-400">{m.tokens} token{m.tokens !== 1 ? 's' : ''}</span>
                <button
                  onClick={() => kickMember(m.id)}
                  disabled={kicking === m.id}
                  className="shrink-0 text-xs font-semibold text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                >
                  {kicking === m.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}

        {showPlayers && pendingMembers.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Added by coach (no account yet)</p>
            {pendingMembers.map(p => {
              const inviteUrl = p.invite_token ? `${BASE_URL}/signup?teamInvite=${p.invite_token}` : null
              return (
                <div key={p.id} className="flex items-center gap-3 py-2 px-3 bg-white rounded-xl border border-gray-100">
                  <span className="flex-1 text-sm font-semibold text-black">
                    {formatPlayerName(p.first_name, p.last_name_initial)}
                  </span>
                  {inviteUrl && (
                    <button
                      onClick={() => copyInviteUrl(inviteUrl, p.id)}
                      className="text-xs font-semibold text-orange-500 hover:text-orange-400 transition-colors shrink-0"
                    >
                      {copiedId === p.id ? 'Copied!' : 'Copy invite link'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {showPlayers && members.length === 0 && pendingMembers.length === 0 && (
          <p className="text-sm text-gray-400">No players yet. Add a player above or have them join using the team code: <span className="font-mono font-semibold text-gray-600">{team.accessCode}</span></p>
        )}
      </div>

      {/* Leaderboard */}
      <div className="bg-gray-50 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-black text-black">Team Leaderboard</h2>
          <div className="flex items-center gap-2">
            {showLeaderboardSection && leaderboard.length > 0 && (
              <button
                onClick={() => setShowLeaderboard(true)}
                className="shrink-0 bg-white border border-gray-300 hover:border-orange-400 text-black font-bold text-sm px-3 py-1.5 rounded-xl transition-colors"
              >
                View full
              </button>
            )}
            <button onClick={() => setShowLeaderboardSection(o => !o)} className="text-xs font-semibold text-gray-400 hover:text-black transition-colors">
              {showLeaderboardSection ? 'Hide ▲' : 'Show ▼'}
            </button>
          </div>
        </div>
        {showLeaderboardSection && (
          leaderboard.length === 0 ? (
            <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl bg-white">
              <p className="font-semibold">No shots analyzed yet</p>
              <p className="text-sm mt-1">Upload a shot above to get started.</p>
            </div>
          ) : (
            <LeaderboardTable entries={leaderboard} />
          )
        )}
      </div>

      {/* Most Improved */}
      {improved.length > 0 && (
        <div className="bg-gray-50 rounded-2xl p-5 space-y-4">
          <h2 className="text-base font-black text-black">Most Improved</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {improved.map((entry) => {
              const gain = Number(entry.latest_score) - Number(entry.first_score)
              return (
                <div key={entry.player_id} className="bg-white border border-gray-100 rounded-2xl p-4 space-y-1">
                  <p className="font-bold text-black">
                    {formatPlayerName(entry.first_name, entry.last_name_initial)}
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

      {/* Full-screen leaderboard popup with print — portaled to <body> so the
          printout isn't preceded by blank pages of (hidden) dashboard content. */}
      {showLeaderboard && createPortal(
        <div
          className="leaderboard-modal-backdrop fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setShowLeaderboard(false)}
        >
          <div
            className="leaderboard-modal bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-auto p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-black text-black">{team.name} Leaderboard</h2>
              <div className="flex items-center gap-2 print:hidden">
                <PrintButton label="Print" />
                <button
                  onClick={() => setShowLeaderboard(false)}
                  className="shrink-0 text-sm font-semibold text-gray-400 hover:text-red-500 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
            <LeaderboardTable entries={leaderboard} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
