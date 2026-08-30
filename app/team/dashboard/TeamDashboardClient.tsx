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
import InfoTip from '@/components/InfoTip'
import AccountTabs from '@/components/account/AccountTabs'
import TeamChatPanel from '@/components/TeamChatPanel'
import EmailTeamPanel from '@/components/EmailTeamPanel'
import Section from '@/components/account/Section'
import TeamSchedulePanel from '@/components/TeamSchedulePanel'
import VolumeSavings, { VolumeTierList } from '@/components/VolumeSavings'
import {
  analysisBaseCents,
  orderPricing,
  usd,
  type OrgTier,
} from '@/lib/team-pricing'
import { copyToClipboard } from '@/lib/copy'
import { useCart } from '@/lib/cart'
import AppearanceSection from '@/components/account/AppearanceSection'

interface Team {
  id: string
  name: string
  accessCode: string
  credits: number
  tokenPool: number
  /** What this team pays for tokens, and which features it may use. */
  tier: OrgTier
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

  // Bulk grant state: one-click 'give N to every joined player'.
  const [bulkGrantEach, setBulkGrantEach] = useState(2)
  const [bulkGranting, setBulkGranting] = useState(false)
  const [bulkGrantMsg, setBulkGrantMsg] = useState('')

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

  async function grantToAll() {
    if (members.length === 0) {
      setBulkGrantMsg('No players on this team yet.')
      return
    }
    const total = members.length * bulkGrantEach
    if (total > team.credits) {
      setBulkGrantMsg(`Need ${total} credits, team has ${team.credits}.`)
      return
    }
    setBulkGranting(true)
    setBulkGrantMsg('')
    try {
      const res = await fetch('/api/team/grant-all-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokensEach: bulkGrantEach }),
      })
      const data = await res.json()
      if (!res.ok) {
        setBulkGrantMsg(data.error || 'Could not grant tokens')
        setBulkGranting(false)
        return
      }
      setBulkGrantMsg(`Gave ${bulkGrantEach} to ${members.length} player${members.length !== 1 ? 's' : ''}.`)
      setBulkGranting(false)
      router.refresh()
    } catch {
      setBulkGrantMsg('Something went wrong.')
      setBulkGranting(false)
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

  const tier = team.tier
  const creditBaseCents = analysisBaseCents(tier)
  const creditRate = (creditBaseCents / 100).toFixed(2)
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
            <p className="text-xs font-semibold text-gray-400 dark:text-chalk-dim uppercase tracking-wide">Team code</p>
            <p className="text-2xl font-black font-mono tracking-widest text-black dark:text-chalk mt-0.5">{team.accessCode}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 dark:text-chalk-dim uppercase tracking-wide mb-1">Player signup link</p>
            <div className="flex items-center gap-2 bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl p-2.5">
              <span className="flex-1 text-xs font-mono text-gray-600 dark:text-chalk-dim truncate">{playerSignupLink}</span>
              <button
                onClick={copySignupLink}
                className="shrink-0 text-sm font-semibold text-orange-500 hover:text-orange-400 transition-colors"
              >
                {copiedSignup ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-chalk-dim mt-1.5">
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
            <p className="text-sm text-gray-500 dark:text-chalk-dim">
              {rosterCount > 0
                ? 'Tap a player to see their shot history.'
                : 'No players yet — add one by name or share the invite link above.'}
            </p>
            <button
              onClick={() => { setAddOpen(o => !o); setAddStatus('idle'); setAddError(''); setNewInviteUrl('') }}
              className="shrink-0 bg-orange-500 hover:bg-orange-400 text-ink-950 font-bold px-3 py-1.5 rounded-xl text-sm transition-colors"
            >
              {addOpen ? 'Cancel' : 'Add Player'}
            </button>
          </div>

          {addOpen && (
            <div className="bg-gray-50 dark:bg-ink-800 border border-gray-200 dark:border-courtline rounded-2xl p-5 space-y-3">
              <p className="text-sm text-gray-500 dark:text-chalk-dim">
                Add a player by name. You can optionally send them a link to create their account — once they sign up, they&apos;ll be automatically added to the team under this name.
              </p>
              <form onSubmit={addPlayer} className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    aria-label="First name"
                    placeholder="First name"
                    value={addFirst}
                    onChange={e => setAddFirst(e.target.value)}
                    className="flex-1 bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-3 text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
                  />
                  <input
                    type="text"
                    maxLength={1}
                    aria-label="Last initial"
                    placeholder="Last initial"
                    value={addInitial}
                    onChange={e => setAddInitial(e.target.value.toUpperCase())}
                    className="w-20 bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-3 text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
                  />
                </div>
                {addError && <p className="text-red-500 text-sm">{addError}</p>}
                <button
                  type="submit"
                  disabled={addStatus === 'loading'}
                  className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-ink-950 font-bold px-4 py-2 rounded-xl text-sm transition-colors"
                >
                  {addStatus === 'loading' ? 'Adding...' : 'Add Player'}
                </button>
              </form>

              {addStatus === 'success' && newInviteUrl && (
                <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 rounded-xl p-4 space-y-2">
                  <p className="text-sm font-semibold text-green-700 dark:text-green-400">Player added! Share this link so they can sign up and join the team:</p>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-xs font-mono text-gray-600 dark:text-chalk-dim truncate">{newInviteUrl}</span>
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
              <p className="text-xs font-semibold text-gray-400 dark:text-chalk-dim uppercase tracking-wide">Joined with account</p>
              {members.map(m => (
                <div key={m.id} className="flex items-center gap-3 py-2 px-3 bg-gray-50 dark:bg-ink-800 rounded-xl border border-gray-100 dark:border-courtline">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/team/dashboard/member/${m.id}`}
                      className="block truncate text-sm font-semibold text-black dark:text-chalk hover:text-orange-600 dark:hover:text-ember-400 hover:underline transition-colors"
                    >
                      {m.first_name ? formatPlayerName(m.first_name, m.last_name_initial) : m.email}
                    </Link>
                    {m.first_name && <p className="text-xs text-gray-400 dark:text-chalk-dim truncate">{m.email}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-gray-400 dark:text-chalk-dim">{m.tokens} token{m.tokens !== 1 ? 's' : ''}</span>
                  <button
                    onClick={() => kickMember(m.id)}
                    disabled={kicking === m.id}
                    className="shrink-0 text-xs font-semibold text-gray-400 dark:text-chalk-dim hover:text-red-500 disabled:opacity-50 transition-colors"
                  >
                    {kicking === m.id ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {pendingMembers.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-400 dark:text-chalk-dim uppercase tracking-wide">Added by coach (no account yet)</p>
              {pendingMembers.map(p => {
                const inviteUrl = p.invite_token ? `${BASE_URL}/signup?teamInvite=${p.invite_token}` : null
                return (
                  <div key={p.id} className="flex items-center gap-3 py-2 px-3 bg-gray-50 dark:bg-ink-800 rounded-xl border border-gray-100 dark:border-courtline">
                    <span className="flex-1 text-sm font-semibold text-black dark:text-chalk">
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
                      className="text-xs font-semibold text-gray-400 dark:text-chalk-dim hover:text-red-500 disabled:opacity-50 transition-colors shrink-0"
                    >
                      {cancelling === p.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {members.length === 0 && pendingMembers.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-chalk-dim">No players yet. Add a player above or have them join using the team code: <span className="font-mono font-semibold text-gray-600 dark:text-chalk-dim">{team.accessCode}</span></p>
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
              className="shrink-0 bg-orange-500 hover:bg-orange-400 text-ink-950 font-bold text-sm px-4 py-2 rounded-xl transition-colors"
            >
              Analyze a shot →
            </Link>
          </div>
          {myUploads.length > 0 ? (
            <PlayerShotList shots={myUploads} />
          ) : (
            <p className="text-sm text-gray-400 dark:text-chalk-dim">
              You haven&apos;t analyzed any of your own shots yet — use the Analyze page to start.
            </p>
          )}
        </div>
      </Section>
    </div>
  )

  /* ── Leaderboard tab ──────────────────────────────────────────── */
  const leaderboardTab = (
    <div className="space-y-4">
      <Section
        title="Team leaderboard"
        tipLabel="How is the leaderboard ranked?"
        tip="Every player's best analyzed score, highest first. It includes shots players uploaded themselves and shots you uploaded for them."
        summary={`${leaderboard.length} player${leaderboard.length !== 1 ? 's' : ''}`}
      >
        {leaderboard.length === 0 ? (
          <div className="text-center py-10 text-gray-400 dark:text-chalk-dim border-2 border-dashed border-gray-200 dark:border-courtline rounded-2xl bg-white dark:bg-ink-900 mt-2">
            <p className="font-semibold">No shots analyzed yet</p>
            <p className="text-sm mt-1">Upload a shot in the Uploads tab to get started.</p>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            <div className="flex justify-end">
              <button
                onClick={() => setShowLeaderboard(true)}
                className="shrink-0 bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline hover:border-orange-400 text-black dark:text-chalk font-bold text-sm px-3 py-1.5 rounded-xl transition-colors"
              >
                View full / print
              </button>
            </div>
            <LeaderboardTable entries={leaderboard} theme="auto" />
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
                <div key={entry.player_id} className="bg-gray-50 dark:bg-ink-800 border border-gray-100 dark:border-courtline rounded-2xl p-4 space-y-1">
                  <p className="font-bold text-black dark:text-chalk">
                    {formatPlayerName(entry.first_name, entry.last_name_initial)}
                  </p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400 dark:text-chalk-dim">{Number(entry.first_score).toFixed(1)}</span>
                    <span className="text-gray-300">→</span>
                    <span className="font-semibold text-black dark:text-chalk">{Number(entry.latest_score).toFixed(1)}</span>
                    <span className={`font-black ml-auto ${gain >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
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
  const settingsTab = (
    <div className="space-y-4">
      <AppearanceSection />
    </div>
  )

  const creditsTab = (
    <div className="space-y-4">
      {/* Quick grant — class-style "give every joined player N credits" in
          one click, paid out of the team's credit pool. Shown when there's
          at least one player. */}
      {members.length > 0 && (
        <div className="bg-orange-50 dark:bg-ember-500/10 border border-orange-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="font-black text-black dark:text-chalk">Quick grant credits to all players</p>
              <p className="text-xs text-gray-600 dark:text-chalk-dim mt-0.5">
                Spend <span className="font-bold text-orange-600 dark:text-ember-400">{bulkGrantEach * members.length}</span> from this team&apos;s {team.credits} credits to give every player {bulkGrantEach} token{bulkGrantEach !== 1 ? 's' : ''}.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <label className="text-xs font-semibold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Each</label>
              {[1, 2, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setBulkGrantEach(n)}
                  className={`w-10 h-10 rounded-lg text-sm font-bold transition-colors ${
                    bulkGrantEach === n
                      ? 'bg-orange-500 text-ink-950 border border-orange-500'
                      : 'bg-white dark:bg-ink-900 text-black dark:text-chalk border border-orange-200 hover:border-orange-400'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={grantToAll}
                disabled={bulkGranting || team.credits < bulkGrantEach * members.length}
                className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-ink-950 font-black text-sm px-4 py-2.5 rounded-xl transition-colors"
              >
                {bulkGranting
                  ? 'Granting…'
                  : `Give ${bulkGrantEach} to all ${members.length}`}
              </button>
            </div>
          </div>
          {bulkGrantMsg && (
            <p className={`text-sm font-medium ${bulkGrantMsg.startsWith('Gave') ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {bulkGrantMsg}
            </p>
          )}
        </div>
      )}

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
            <p className="text-sm text-gray-600 dark:text-chalk-dim">
              ${creditRate} per credit
              <span className="ml-1.5 text-xs text-green-600 dark:text-green-400 font-semibold">team rate — $1.49 each when you buy 5+</span>
            </p>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Quantity</p>
              <div className="flex gap-2">
                {[1, 5, 10].map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => { setQuantity(q); setCustomQty('') }}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                      quantity === q && !customQty
                        ? 'bg-orange-500 text-ink-950 border-orange-500'
                        : 'bg-white dark:bg-ink-900 text-black dark:text-chalk border-gray-300 dark:border-courtline hover:border-orange-400'
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
                className="w-full py-2.5 px-3 border border-gray-300 dark:border-courtline rounded-xl text-black dark:text-chalk text-sm placeholder:text-gray-400 dark:placeholder:text-chalk-dim placeholder:font-normal focus:outline-none focus:border-orange-500"
              />
            </div>

            <VolumeTierList tier={tier} className="px-1" />

            <VolumeSavings
              tier={tier}
              quantity={quantity}
              label="credit"
              onJump={(q) => { setQuantity(Math.min(500, q)); setCustomQty('') }}
            />

            <button
              onClick={buyCredits}
              disabled={buying}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-ink-950 font-black py-3 rounded-xl transition-colors"
            >
              {buying
                ? 'Redirecting to checkout…'
                : `Buy ${quantity} Credit${quantity !== 1 ? 's' : ''} — ${usd(orderPricing(tier, quantity).totalCents)}`}
            </button>
          </div>
        </Section>
      )}

      <Section
        title="Give tokens to players"
        tipLabel="Which balance pays?"
        tip="Pick the balance to pay from: My credits is your personal balance, Team credits is the shared balance your organization funds, and the Token pool holds the team's unassigned tokens (like the free activation tokens). Each token is one shot analysis the player can run themselves."
        summary={`${coachCredits} personal · ${team.credits} team · ${team.tokenPool} pool`}
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

      <Section
        title="Balances"
        tipLabel="Pool tokens vs. player tokens?"
        tip="Pool tokens belong to the team and haven't been handed out yet. Once you assign them, they become that player's tokens — each token is one shot analysis the player can run themselves."
        summary={`${team.tokenPool} in pool`}
      >
        <div className="space-y-4 pt-2">
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
    <div className="max-w-3xl mx-auto w-full px-6 py-10 space-y-6 flex-1">
      {fromOrg && (
        <Link
          href="/org/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-500 hover:text-orange-400 transition-colors"
        >
          ← Back to organization dashboard
        </Link>
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      {/* flex-wrap: on phones the action buttons take their own row instead of
          being crushed beside the team name and clipped off-screen (the app's
          webview had the Organization Hub and Log out buttons unreachable). */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <InlineEdit
            value={team.name}
            endpoint="/api/team/rename"
            bodyKey="name"
            placeholder="Team name"
            textClassName="text-2xl font-black text-black dark:text-chalk"
          />
          <p className="text-gray-500 dark:text-chalk-dim text-sm mt-1">
            Team Dashboard · Logged in as{' '}
            <span className="font-semibold text-gray-700 dark:text-chalk-dim">{myNickname || adminEmail}</span>
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
                      ? 'bg-orange-500 text-ink-950'
                      : 'bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline text-black dark:text-chalk hover:border-orange-400'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex w-full sm:w-auto items-center gap-2 sm:shrink-0">
          {!inApp && <Link
            href="/team"
            className="flex-1 sm:flex-none text-center border border-orange-300 text-orange-600 dark:text-ember-400 hover:bg-orange-50 dark:hover:bg-ember-500/10 font-bold text-sm px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
          >
            🏢 Organization Hub
          </Link>}
          <button
            onClick={logout}
            disabled={loggingOut}
            className="flex-1 sm:flex-none bg-orange-500 hover:bg-red-500 disabled:opacity-60 text-ink-950 font-bold text-sm px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
          >
            {loggingOut ? 'Logging out...' : 'Log out'}
          </button>
        </div>
      </header>

      {/* ── Key stats — always visible above the tabs ───────────── */}
      <section className="bg-orange-50 dark:bg-ember-500/10 border border-orange-200 rounded-2xl p-5">
        <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-bold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Team code</h2>
              <InfoTip label="What is the team code for?" align="left">
                Players enter this code (or use the signup link in the Players
                tab) to join your team&apos;s roster. Only share it with your
                own players — anyone with the code can join.
              </InfoTip>
            </div>
            <p className="text-2xl font-black font-mono tracking-widest text-black dark:text-chalk mt-1">{team.accessCode}</p>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-bold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">My credits</h2>
              <InfoTip label="What are my credits?" align="left">
                Your personal balance — 1 credit = 1 AI shot analysis. Credits
                you buy or that your organization gives you personally land
                here. Spend them on your own uploads or hand them to players
                as tokens.
              </InfoTip>
            </div>
            <p className="text-2xl font-black text-black dark:text-chalk mt-1">{coachCredits}</p>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-bold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Team credits</h2>
              <InfoTip label="What are team credits?" align="left">
                A shared balance that belongs to the team — usually funded by
                your organization. Spend them on this team&apos;s players (or
                your own uploads once your personal credits run out).
              </InfoTip>
            </div>
            <p className="text-2xl font-black text-black dark:text-chalk mt-1">{team.credits}</p>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-bold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Token pool</h2>
              <InfoTip label="What is the token pool?">
                Analysis tokens the team owns but hasn&apos;t handed out yet
                (like the free tokens from activation). Assign them to players
                in the Tokens &amp; Credits tab — players then spend their own
                tokens when they upload a shot.
              </InfoTip>
            </div>
            <p className="text-2xl font-black text-black dark:text-chalk mt-1">{team.tokenPool}</p>
          </div>

          {/* Web credit pricing does not exist inside the iOS app — IAP has its
              own prices, so quoting $2.49 here reads as a broken discount. */}
          {!inApp && <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-bold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Credit price</h2>
              <InfoTip label="How is the credit price set?" align="right">
                Every team gets the team rate from day one — no player minimum.
                Credits are $2.49 each, dropping to $1.49 each when you buy 5
                or more in one order.
              </InfoTip>
            </div>
            <p className="text-2xl font-black text-black dark:text-chalk mt-1">${creditRate}</p>
            <p className="text-[11px] text-green-600 dark:text-green-400 font-semibold leading-tight">team rate active</p>
          </div>}
        </div>
      </section>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <AccountTabs
        tabs={[
          { id: 'players', label: 'Players', count: rosterCount, content: playersTab },
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
          { id: 'settings', label: 'Settings', content: settingsTab },
        ]}
      />

      {/* Full-screen leaderboard popup with print — portaled to <body> so the
          printout isn't preceded by blank pages of (hidden) dashboard content. */}
      {showLeaderboard && createPortal(
        <div
          className="leaderboard-modal-backdrop fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setShowLeaderboard(false)}
        >
          <div
            className="leaderboard-modal bg-white dark:bg-ink-900 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-auto p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-black text-black dark:text-chalk">{team.name} Leaderboard</h2>
              <div className="flex items-center gap-2 print:hidden">
                <PrintButton label="Print" />
                <button
                  onClick={() => setShowLeaderboard(false)}
                  className="shrink-0 text-sm font-semibold text-gray-400 dark:text-chalk-dim hover:text-red-500 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
            <LeaderboardTable entries={leaderboard} theme="auto" />
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
