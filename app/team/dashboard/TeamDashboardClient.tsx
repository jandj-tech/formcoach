'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useIsInApp } from '@/lib/useIsInApp'
import Link from 'next/link'
import CoachUploadForm from './CoachUploadForm'
import TeamCoaches from './TeamCoaches'
import CoachAssignPanel from '@/components/CoachAssignPanel'
import TokenBalances from '@/components/TokenBalances'
import LeaderboardTable from '@/components/LeaderboardTable'
import PrintButton from '@/components/PrintButton'
import InlineEdit from '@/components/InlineEdit'
import PlayerShotList, { type Shot } from '@/components/PlayerShotList'
import BillingHistory from '@/components/BillingHistory'
import ClassManager, { type ClassManagerPackage } from '@/components/ClassManager'
import InfoTip from '@/components/InfoTip'
import AccountTabs from '@/components/account/AccountTabs'
import TeamChatPanel from '@/components/TeamChatPanel'
import EmailTeamPanel from '@/components/EmailTeamPanel'
import Section from '@/components/account/Section'
import TeamSchedulePanel from '@/components/TeamSchedulePanel'
import VolumeSavings, { VolumeTierList } from '@/components/VolumeSavings'
import {
  analysisUnitCents,
  orderPricing,
  usd,
} from '@/lib/team-pricing'
import { copyToClipboard } from '@/lib/copy'
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
  avg_score: number | string | null
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
  myUploads: Shot[]
  coachCredits: number
  /** The 10-week program this team runs, when it was created by one. */
  classPackages: ClassManagerPackage[]
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
  myUploads,
  coachCredits,
  classPackages,
}: Props) {
  const router = useRouter()
  const { clear: clearCart } = useCart()
  const inApp = useIsInApp()
  const [buying, setBuying] = useState(false)
  const [quantity, setQuantity] = useState(10)
  const [customQty, setCustomQty] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [kicking, setKicking] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)

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
      // One coach balance (coach_credits): funds the coach's own uploads,
      // uploading on behalf of players, and is distributable to any player.
      const res = await fetch('/api/team/buy-self-credits', {
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

  async function cancelPendingPlayer(playerId: string) {
    if (!confirm('Cancel this player? They were added by name and haven’t joined yet.')) return
    setCancelling(playerId)
    try {
      const res = await fetch('/api/team/remove-pending-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      })
      if (!res.ok) throw new Error('Failed')
      router.refresh()
    } catch {
      setCancelling(null)
      alert('Could not cancel that player. Please try again.')
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
    copyToClipboard(url, 'Invite link copied!').then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  function copySignupLink() {
    copyToClipboard(playerSignupLink, 'Signup link copied!').then(() => {
      setCopiedSignup(true)
      setTimeout(() => setCopiedSignup(false), 2000)
    })
  }

  function copyNewInviteUrl() {
    copyToClipboard(newInviteUrl, 'Invite link copied!').then(() => {
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

  const creditBaseCents = analysisUnitCents(team.initiated)
  const creditRate = (analysisUnitCents(team.initiated) / 100).toFixed(2)
  const rosterCount = members.length + pendingMembers.length

  /* ── Players tab ──────────────────────────────────────────────── */
  const playersTab = (
    <div className="space-y-4">
      <Section
        title="Invite players"
        tipLabel="How do players join the team?"
        tip="Send players the signup link (or the team code). They create an account, enter their name, and land on your roster automatically — no approval step needed."
        summary={`Code ${team.accessCode}`}
      >
        <div className="space-y-4 pt-2">
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
      </Section>

      <Section
        title="Roster"
        tipLabel="Who shows up on the roster?"
        tip="Players who joined with an account, plus players you added by name (they can claim their spot later with their invite link)."
        summary={`${members.length} joined${pendingMembers.length > 0 ? `, ${pendingMembers.length} pending` : ''}`}
      >
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-gray-500">
              {rosterCount > 0
                ? 'Tap a player to see their shot history.'
                : 'No players yet — add one by name or share the invite link above.'}
            </p>
            <button
              onClick={() => { setAddOpen(o => !o); setAddStatus('idle'); setAddError(''); setNewInviteUrl('') }}
              className="shrink-0 bg-orange-500 hover:bg-orange-400 text-white font-bold px-3 py-1.5 rounded-xl text-sm transition-colors"
            >
              {addOpen ? 'Cancel' : 'Add Player'}
            </button>
          </div>

          {addOpen && (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-3">
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

          {members.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Joined with account</p>
              {members.map(m => (
                <div key={m.id} className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-xl border border-gray-100">
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

          {pendingMembers.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Added by coach (no account yet)</p>
              {pendingMembers.map(p => {
                const inviteUrl = p.invite_token ? `${BASE_URL}/signup?teamInvite=${p.invite_token}` : null
                return (
                  <div key={p.id} className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-xl border border-gray-100">
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
                    <button
                      onClick={() => cancelPendingPlayer(p.id)}
                      disabled={cancelling === p.id}
                      className="text-xs font-semibold text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors shrink-0"
                    >
                      {cancelling === p.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {members.length === 0 && pendingMembers.length === 0 && (
            <p className="text-sm text-gray-400">No players yet. Add a player above or have them join using the team code: <span className="font-mono font-semibold text-gray-600">{team.accessCode}</span></p>
          )}
        </div>
      </Section>

      <Section
        title="Coaches"
        tipLabel="What can added coaches do?"
        tip="Extra coaches log in with their own account and see this same dashboard — handy for assistant coaches or trainers."
        summary={`${coaches.length + 1} coach${coaches.length + 1 !== 1 ? 'es' : ''}`}
      >
        <div className="pt-2">
          <TeamCoaches
            foundingCoachEmail={foundingCoachEmail}
            foundingCoachNickname={foundingCoachNickname}
            coaches={coaches}
            myNickname={myNickname}
          />
        </div>
      </Section>
    </div>
  )

  /* ── Uploads tab ──────────────────────────────────────────────── */
  const uploadsTab = (
    <div className="space-y-4">
      <Section
        title="Upload a shot for a player"
        tipLabel="How do coach uploads work?"
        tip="Record a player's shot and upload it here — it spends one of your credits and the analysis is filed under that player's name on the leaderboard."
      >
        <div className="pt-2">
          <CoachUploadForm accessCode={team.accessCode} members={uploadableMembers} />
        </div>
      </Section>

      <Section
        title="My uploads"
        tipLabel="What counts as my upload?"
        tip="Shots you analyzed for yourself (not on behalf of a player). Uploads you make for players live on each player's page instead."
        summary={`${myUploads.length} shot${myUploads.length !== 1 ? 's' : ''}`}
      >
        <div className="space-y-3 pt-2">
          <div className="flex justify-end">
            <Link
              href="/analyze"
              className="shrink-0 bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm px-4 py-2 rounded-xl transition-colors"
            >
              Analyze a shot →
            </Link>
          </div>
          {myUploads.length > 0 ? (
            <PlayerShotList shots={myUploads} />
          ) : (
            <p className="text-sm text-gray-400">
              You haven&apos;t analyzed any of your own shots yet — use the Analyze page to start.
            </p>
          )}
        </div>
      </Section>
    </div>
  )

  /* ── Leaderboard tab ──────────────────────────────────────────── */
  const classTab = (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Class Manager</h2>
        <p className="text-sm text-gray-500 mt-1">
          Your 10-Week Shooting Development Program — the week-by-week coach guide, roster
          progress, standings, and completion certificates.
        </p>
      </div>
      <ClassManager
        packages={classPackages.map(pkg => ({
          ...pkg,
          teamName: team.name,
          teamCredits: team.credits,
        }))}
        canManage
      />
    </div>
  )

  const leaderboardTab = (
    <div className="space-y-4">
      <Section
        title="Team leaderboard"
        tipLabel="How is the leaderboard ranked?"
        tip="Every player's best analyzed score, highest first. It includes shots players uploaded themselves and shots you uploaded for them."
        summary={`${leaderboard.length} player${leaderboard.length !== 1 ? 's' : ''}`}
      >
        {leaderboard.length === 0 ? (
          <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl bg-white mt-2">
            <p className="font-semibold">No shots analyzed yet</p>
            <p className="text-sm mt-1">Upload a shot in the Uploads tab to get started.</p>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            <div className="flex justify-end">
              <button
                onClick={() => setShowLeaderboard(true)}
                className="shrink-0 bg-white border border-gray-300 hover:border-orange-400 text-black font-bold text-sm px-3 py-1.5 rounded-xl transition-colors"
              >
                View full / print
              </button>
            </div>
            <LeaderboardTable entries={leaderboard} />
          </div>
        )}
      </Section>

      {improved.length > 0 && (
        <Section
          title="Most improved"
          tipLabel="How is improvement measured?"
          tip="First analyzed score vs. latest analyzed score, for every player with at least two uploads."
          summary={`${improved.length} player${improved.length !== 1 ? 's' : ''}`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {improved.map((entry) => {
              const gain = Number(entry.latest_score) - Number(entry.first_score)
              return (
                <div key={entry.player_id} className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-1">
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
        </Section>
      )}
    </div>
  )

  /* ── Tokens & Credits tab ─────────────────────────────────────── */
  const creditsTab = (
    <div className="space-y-4">
      {/* Giving is the everyday action, so it leads the tab. "Entire team"
          mode replaces the old separate quick-grant banner. */}
      <Section
        title="Give credits to players"
        tipLabel="How does giving credits work?"
        tip="Pick the balance to pay from (My credits is your personal balance, Team credits is the shared balance your organization funds, and the Token pool holds the team's unassigned tokens), then give to the whole team at once or to specific players. Each token is one shot analysis the player can run themselves."
        summary={`${coachCredits} personal · ${team.credits} team · ${team.tokenPool} pool`}
        defaultOpen
      >
        <div className="pt-2">
          <CoachAssignPanel
            personalCredits={coachCredits}
            teamCredits={team.credits}
            tokenPool={team.tokenPool}
            players={members.map(m => ({
              id: m.id,
              label: m.first_name ? formatPlayerName(m.first_name, m.last_name_initial) : m.email,
              tokens: m.tokens,
            }))}
          />
        </div>
      </Section>

      {/* Buy Credits — hidden in the iOS app: digital purchases there must
          use native in-app purchase. */}
      {!inApp && (
        <Section
          title="Buy credits"
          tipLabel="What do credits pay for?"
          tip="1 credit = 1 AI shot analysis. Purchases land in My credits, your personal balance. Use them for your own uploads, uploading on behalf of players, or hand them to any player as tokens."
          summary={`$${creditRate} per credit`}
        >
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-600">
              ${creditRate} per credit
              {team.initiated
                ? <span className="ml-1.5 text-xs text-green-600 font-semibold">discounted $1.49 rate active</span>
                : <span className="ml-1.5 text-xs text-gray-500">drops to $1.49 once your team reaches 8 players</span>}
            </p>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quantity</p>
              <div className="flex gap-2">
                {[1, 5, 10].map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => { setQuantity(q); setCustomQty('') }}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                      quantity === q && !customQty
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
                max={500}
                value={customQty}
                onChange={e => {
                  const v = e.target.value
                  setCustomQty(v)
                  const n = parseInt(v)
                  if (!Number.isNaN(n)) setQuantity(Math.min(500, Math.max(1, n)))
                }}
                onFocus={e => e.target.select()}
                placeholder="Or enter a custom amount…"
                aria-label="Custom credit amount"
                className="w-full py-2.5 px-3 border border-gray-300 rounded-xl text-black text-sm placeholder:text-gray-400 placeholder:font-normal focus:outline-none focus:border-orange-500"
              />
            </div>

            <VolumeTierList baseUnitCents={creditBaseCents} className="px-1" />

            <VolumeSavings
              baseUnitCents={creditBaseCents}
              quantity={quantity}
              label="credit"
              onJump={(q) => { setQuantity(Math.min(500, q)); setCustomQty('') }}
            />

            <button
              onClick={buyCredits}
              disabled={buying}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-black py-3 rounded-xl transition-colors"
            >
              {buying
                ? 'Redirecting to checkout…'
                : `Buy ${quantity} Credit${quantity !== 1 ? 's' : ''} — ${usd(orderPricing(creditBaseCents, quantity).totalCents)}`}
            </button>
          </div>
        </Section>
      )}

      <Section
        title="Balances"
        tipLabel="Pool tokens vs. player tokens?"
        tip="Pool tokens belong to the team and haven't been handed out yet. Once you assign them, they become that player's tokens — each token is one shot analysis the player can run themselves."
        summary={`${team.tokenPool} in pool`}
      >
        <div className="space-y-4 pt-2">
          {!team.initiated && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-black">Team not yet active</p>
                <span className="text-xs font-black text-orange-500">{members.length}/8 players</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-orange-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (members.length / 8) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                {8 - members.length > 0
                  ? `${8 - members.length} more player${8 - members.length !== 1 ? 's' : ''} needed to activate this team.`
                  : 'Almost there!'
                }
                {' '}Once you reach 8 players, every player on the team automatically gets <strong>1 free analysis token</strong>{inApp ? '' : ', and the team unlocks the ability to purchase additional tokens at $1.49 each'}.
              </p>
              <p className="text-xs text-gray-400">Share your team signup link (in the Players tab) to invite players.</p>
            </div>
          )}

          <TokenBalances
            players={members.map(m => ({
              id: m.id,
              label: m.first_name ? formatPlayerName(m.first_name, m.last_name_initial) : m.email,
              tokens: m.tokens,
            }))}
            teamCredits={team.credits}
            tokenPool={team.tokenPool}
          />
        </div>
      </Section>
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto w-full px-6 py-10 space-y-6 flex-1">
      {fromOrg && (
        <Link
          href="/org/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-500 hover:text-orange-400 transition-colors"
        >
          ← Back to organization dashboard
        </Link>
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-4">
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
        {/* w-full on phones: the button takes its own row under the team name
            instead of being crushed beside it and clipped off-screen. */}
        <div className="flex w-full sm:w-auto items-center gap-2 sm:shrink-0">
          <button
            onClick={logout}
            disabled={loggingOut}
            className="flex-1 sm:flex-none border border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600 disabled:opacity-60 font-semibold text-sm px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
          >
            {loggingOut ? 'Logging out...' : 'Log out'}
          </button>
        </div>
      </header>

      {/* ── Key stats — always visible above the tabs ───────────── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-1.5">
            <h2 className="text-xs font-medium text-gray-500">Team code</h2>
            <InfoTip label="What is the team code for?" align="left">
              Players enter this code (or use the signup link in the Players
              tab) to join your team&apos;s roster. Only share it with your
              own players — anyone with the code can join.
            </InfoTip>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <p className="text-xl font-bold font-mono tracking-widest text-gray-900">{team.accessCode}</p>
            <button
              onClick={copySignupLink}
              className="text-xs font-semibold text-orange-600 hover:text-orange-500 transition-colors"
            >
              {copiedSignup ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-1.5">
            <h2 className="text-xs font-medium text-gray-600">My credits</h2>
            <InfoTip label="What are my credits?" align="left">
              Your personal balance — 1 credit = 1 AI shot analysis. Credits
              you buy or that your organization gives you personally land
              here. Spend them on your own uploads or hand them to players
              as tokens.
            </InfoTip>
          </div>
          <p className="text-xl font-bold text-gray-900 tabular-nums mt-0.5">{coachCredits}</p>
          <p className="text-xs text-gray-500 mt-1">
            {team.initiated
              ? `$${creditRate} each · discounted rate active`
              : `$${creditRate} each · ${members.length}/8 players to unlock $1.49`}
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-1.5">
            <h2 className="text-xs font-medium text-gray-500">Team credits</h2>
            <InfoTip label="What are team credits?" align="left">
              A shared balance that belongs to the team — usually funded by
              your organization. Spend them on this team&apos;s players (or
              your own uploads once your personal credits run out).
            </InfoTip>
          </div>
          <p className="text-xl font-bold text-gray-900 tabular-nums mt-0.5">{team.credits}</p>
          <p className="text-xs text-gray-400 mt-1">shared with the org</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-1.5">
            <h2 className="text-xs font-medium text-gray-500">Token pool</h2>
            <InfoTip label="What is the token pool?" align="right">
              Analysis tokens the team owns but hasn&apos;t handed out yet
              (like the free tokens from activation). Assign them to players
              in the Tokens &amp; Credits tab — players then spend their own
              tokens when they upload a shot.
            </InfoTip>
          </div>
          <p className="text-xl font-bold text-gray-900 tabular-nums mt-0.5">{team.tokenPool}</p>
          <p className="text-xs text-gray-400 mt-1">unassigned tokens</p>
        </div>
      </section>

      {/* Signpost to the flagship class program — bought at organization
          level, so this links to the program page rather than a buy form.
          Teams already running one get the Class Manager tab instead. */}
      {!inApp && classPackages.length === 0 && (
        <Link
          href="/team#class-program"
          className="flex items-center justify-between gap-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 rounded-2xl px-5 py-4 text-white transition-colors"
        >
          <div className="min-w-0">
            <p className="text-orange-100 text-[11px] font-semibold uppercase tracking-wider">For your program</p>
            <p className="font-bold text-base truncate">10-Week Shooting Class · $40/player</p>
            <p className="text-orange-100 text-xs mt-0.5 truncate">
              Ball, 2 shot analyses &amp; a certificate per player — run it through your organization
            </p>
          </div>
          <span className="shrink-0 bg-white/20 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap">
            Learn more →
          </span>
        </Link>
      )}

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <AccountTabs
        tabs={[
          { id: 'players', label: 'Players', count: rosterCount, content: playersTab },
          // A team created by a class purchase runs the program from here.
          ...(classPackages.length > 0
            ? [{ id: 'class', label: 'Class Manager', content: classTab }]
            : []),
          {
            id: 'schedule',
            label: 'Schedule',
            content: (
              <Section title="Team Schedule" defaultOpen>
                <TeamSchedulePanel teamId={team.id} theme="light" />
              </Section>
            ),
          },
          { id: 'chat', label: 'Chat', content: <TeamChatPanel teamId={team.id} /> },
          { id: 'email', label: 'Email Team', content: <EmailTeamPanel teamId={team.id} playerCount={members.length} /> },
          { id: 'uploads', label: 'Uploads', content: uploadsTab },
          { id: 'leaderboard', label: 'Leaderboard', count: leaderboard.length, content: leaderboardTab },
          { id: 'credits', label: 'Tokens & Credits', content: creditsTab },
          {
            id: 'billing',
            label: 'Billing',
            content: (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Billing</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Your purchases — credits for yourself and this team.
                    Receipts are emailed at checkout.
                  </p>
                </div>
                <BillingHistory
                  endpoint="/api/team/billing"
                  emptyAction={!inApp ? (
                    <button
                      onClick={() => document.querySelector<HTMLButtonElement>('[data-tab="credits"]')?.click()}
                      className="bg-orange-500 hover:bg-orange-400 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
                    >
                      Buy your first credits
                    </button>
                  ) : undefined}
                />
              </div>
            ),
          },
        ]}
      />

      <p className="text-center text-xs text-gray-400 pt-2">
        New to coaching a team here?{' '}
        <Link href="/team" className="text-orange-600 hover:text-orange-500 font-medium">
          Learn how LearnHoops works for teams &amp; organizations →
        </Link>
      </p>

      {/* Full-screen leaderboard popup with print — portaled to <body> so the
          printout isn't preceded by blank pages of (hidden) dashboard content. */}
      {showLeaderboard && createPortal(
        <div
          className="leaderboard-modal-backdrop fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setShowLeaderboard(false)}
        >
          <div
            className="leaderboard-modal bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-auto p-6 space-y-4"
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
