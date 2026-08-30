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
import ClassManager, { type ClassManagerPackage } from '@/components/ClassManager'
import TeamChatPanel from '@/components/TeamChatPanel'
import EmailTeamPanel from '@/components/EmailTeamPanel'
import Section from '@/components/account/Section'
import TeamSchedulePanel from '@/components/TeamSchedulePanel'
import VolumeSavings, { VolumeTierList } from '@/components/VolumeSavings'
import {
  analysisBaseCents,
  discountedUnitCents,
  orderPricing,
  tiersFor,
  usd,
  type OrgTier,
} from '@/lib/team-pricing'
import { copyToClipboard } from '@/lib/copy'
import { useCart } from '@/lib/cart'
import AppearanceSection from '@/components/account/AppearanceSection'
import DashboardShell from '@/components/backend/DashboardShell'
import DashboardHeader from '@/components/backend/DashboardHeader'
import { StatGrid, StatCard } from '@/components/backend/StatGrid'
import { backendButton } from '@/components/backend/button-styles'
import { ArrowRightIcon, Building2Icon, LogOutIcon } from 'lucide-react'
import { CLASS_ANALYSES_PER_PLAYER } from '@/lib/org-class-pricing'

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
  /** The 10-Week Shooting Class this team is running, or null if it isn't. */
  classProgram: (ClassManagerPackage & { tokenPool: number }) | null
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
  classProgram,
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
  // The invite front door (app/join/[code]) rather than /signup: it shows the
  // player what they are joining first, and works whether or not they already
  // have an account. A raw signup link did neither.
  const playerSignupLink = `${BASE_URL}/join/${team.accessCode}`

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
    copyToClipboard(playerSignupLink, 'Invite link copied!').then(() => {
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
  // A team only earns the discounted team rate through an organization plan.
  // A standalone team resolves to tier 'none' and pays the same price as any
  // individual — the copy below has to say so rather than advertising a rate
  // this team cannot get.
  const onTeamRate = tier !== 'none'
  // The team's own first volume step, read off its ladder instead of typed in,
  // so repricing lib/team-pricing.ts can never leave a stale number here.
  const firstStep = tiersFor(tier).reduce((lowest, t) => (t.minQty < lowest.minQty ? t : lowest))
  const firstStepRate = usd(discountedUnitCents(tier, firstStep.minQty))
  const rosterCount = members.length + pendingMembers.length

  /* ── Players tab ──────────────────────────────────────────────── */
  const playersTab = (
    <div className="space-y-4">
      <Section
        title="Invite players"
        tipLabel="How do players join the team?"
        tip="Send the invite link. It shows the player your team, then signs them up or logs them in and puts them straight on your roster — no approval step. The team code does the same thing for anyone who'd rather type it."
        summary={`Code ${team.accessCode}`}
      >
        <div className="space-y-4 pt-2">
          {/* The link leads: it is the thing a coach actually sends, and it
              works for a player who already has an account. The code stays
              underneath for word of mouth ("ask your coach for the code"). */}
          <div>
            <p className="text-xs font-semibold text-gray-400 dark:text-chalk-dim uppercase tracking-wide mb-1">Invite link</p>
            <div className="flex items-center gap-2 bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl p-2.5">
              <span className="flex-1 text-xs font-mono text-gray-600 dark:text-chalk-dim truncate">{playerSignupLink}</span>
              <button
                onClick={copySignupLink}
                className="shrink-0 text-sm font-semibold text-ember-500 hover:text-ember-400 transition-colors"
              >
                {copiedSignup ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-chalk-dim mt-1.5">
              Text or email this to your players. One tap and they&apos;re on the roster.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 dark:text-chalk-dim uppercase tracking-wide">Or give them the code</p>
            <p className="text-xl font-black font-mono tracking-widest text-black dark:text-chalk mt-0.5">{team.accessCode}</p>
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
              className="shrink-0 bg-ember-500 hover:bg-ember-400 text-ink-950 font-bold px-3 py-1.5 rounded-xl text-sm transition-colors"
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
                    className="flex-1 bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-3 text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors"
                  />
                  <input
                    type="text"
                    maxLength={1}
                    aria-label="Last initial"
                    placeholder="Last initial"
                    value={addInitial}
                    onChange={e => setAddInitial(e.target.value.toUpperCase())}
                    className="w-20 bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-3 text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors"
                  />
                </div>
                {addError && <p className="text-red-500 text-sm">{addError}</p>}
                <button
                  type="submit"
                  disabled={addStatus === 'loading'}
                  className="bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-bold px-4 py-2 rounded-xl text-sm transition-colors"
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
                      className="shrink-0 text-sm font-semibold text-ember-500 hover:text-ember-400 transition-colors"
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
                      className="block truncate text-sm font-semibold text-black dark:text-chalk hover:text-ember-600 dark:hover:text-ember-400 hover:underline transition-colors"
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
                        className="text-xs font-semibold text-ember-500 hover:text-ember-400 transition-colors shrink-0"
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
            <Link href="/analyze" className={backendButton('primary', 'shrink-0')}>
              Analyze a shot
              <ArrowRightIcon aria-hidden />
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
                className="shrink-0 bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline hover:border-ember-400 text-black dark:text-chalk font-bold text-sm px-3 py-1.5 rounded-xl transition-colors"
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
                    <ArrowRightIcon aria-hidden className="w-3.5 h-3.5 text-gray-300 dark:text-chalk-dim" />
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

  /* ── Program tab ──────────────────────────────────────────────── */
  // The 10-Week Shooting Class is sold to organizations, which assign it to a
  // team. Either way the COACH is the person who actually runs it week to
  // week, so this is where their copy of it lives: how far the roster has got,
  // and the session plan. A coach whose team has no class still gets an
  // explanation — before this tab existed the program was invisible to them.
  const programTab = classProgram ? (
    <div className="space-y-4">
      <ClassManager packages={[classProgram]} canManage />

      {classProgram.tokenPool > 0 && (
        <p className="text-xs text-gray-500 dark:text-chalk-dim">
          The class came with {classProgram.tokenPool} analysis token{classProgram.tokenPool === 1 ? '' : 's'} for this
          team. They sit in the token pool and are handed out from Tokens &amp; Credits.
        </p>
      )}
    </div>
  ) : (
    <div className="rounded-2xl border border-gray-200 dark:border-courtline p-5">
      <h3 className="font-black text-black dark:text-chalk">10-Week Shooting Class</h3>
      <p className="text-sm text-gray-600 dark:text-chalk-dim mt-1.5 leading-relaxed">
        Ten structured sessions that take a player from a baseline shot analysis
        through grip, elbow, stance, release and arc, to a final evaluation and a
        certificate. Every place includes {CLASS_ANALYSES_PER_PLAYER} analyses and a training ball.
      </p>
      <p className="text-sm text-gray-600 dark:text-chalk-dim mt-3 leading-relaxed">
        The class runs through an organization — a club, school or academy buys
        the places and assigns them to its teams. This team isn&apos;t part of one
        yet, so there&apos;s nothing to run here. If your club already has a
        LearnHoops organization, ask them to add this team to it; the class then
        shows up on this tab.
      </p>
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
        <div className="bg-ember-50 dark:bg-ember-500/10 border border-ember-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="font-black text-black dark:text-chalk">Quick grant credits to all players</p>
              <p className="text-xs text-gray-600 dark:text-chalk-dim mt-0.5">
                Spend <span className="font-bold text-ember-600 dark:text-ember-400">{bulkGrantEach * members.length}</span> from this team&apos;s {team.credits} credits to give every player {bulkGrantEach} token{bulkGrantEach !== 1 ? 's' : ''}.
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
                      ? 'bg-ember-500 text-ink-950 border border-ember-500'
                      : 'bg-white dark:bg-ink-900 text-black dark:text-chalk border border-ember-200 hover:border-ember-400'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={grantToAll}
                disabled={bulkGranting || team.credits < bulkGrantEach * members.length}
                className="bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-black text-sm px-4 py-2.5 rounded-xl transition-colors"
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
              <span
                className={`ml-1.5 text-xs font-semibold ${
                  onTeamRate ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-chalk-dim'
                }`}
              >
                {onTeamRate ? 'team rate' : 'regular rate'} — {firstStepRate} each when you buy {firstStep.minQty}+
              </span>
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
                        ? 'bg-ember-500 text-ink-950 border-ember-500'
                        : 'bg-white dark:bg-ink-900 text-black dark:text-chalk border-gray-300 dark:border-courtline hover:border-ember-400'
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
                className="w-full py-2.5 px-3 border border-gray-300 dark:border-courtline rounded-xl text-black dark:text-chalk text-sm placeholder:text-gray-400 dark:placeholder:text-chalk-dim placeholder:font-normal focus:outline-none focus:border-ember-500"
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
              className="w-full bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-black py-3 rounded-xl transition-colors"
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
    <DashboardShell>
      <DashboardHeader
        eyebrow="Team dashboard"
        title={
          <InlineEdit
            value={team.name}
            endpoint="/api/team/rename"
            bodyKey="name"
            placeholder="Team name"
            textClassName="text-2xl sm:text-3xl font-black text-black dark:text-chalk"
          />
        }
        meta={
          <>
            Signed in as{' '}
            <span className="font-semibold text-gray-700 dark:text-chalk">{myNickname || adminEmail}</span>
          </>
        }
        back={fromOrg ? { href: '/org/dashboard', label: 'Back to organization dashboard' } : undefined}
        actions={
          <>
            {!inApp && (
              <Link href="/team" className={backendButton('quiet')}>
                <Building2Icon aria-hidden />
                Organization Hub
              </Link>
            )}
            <button onClick={logout} disabled={loggingOut} className={backendButton('quiet')}>
              <LogOutIcon aria-hidden />
              {loggingOut ? 'Logging out…' : 'Log out'}
            </button>
          </>
        }
      >
        {allTeams.length > 1 && (
          <div className="flex flex-wrap gap-2">
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
                aria-pressed={t.id === currentTeamId}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  t.id === currentTeamId
                    ? 'bg-ember-500 text-ink-950'
                    : 'bg-white dark:bg-ink-900 border border-gray-200 dark:border-courtline text-black dark:text-chalk hover:border-ember-400'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </DashboardHeader>

      {/* ── Key numbers — always visible above the tabs ───────────── */}
      <StatGrid>
        <StatCard
          label="Team code"
          value={team.accessCode}
          mono
          accent
          hint={
            <InfoTip label="What is the team code for?" align="left">
              Players enter this code (or use the signup link in the Players
              tab) to join your team&apos;s roster. Only share it with your
              own players — anyone with the code can join.
            </InfoTip>
          }
        />

        <StatCard
          label="My credits"
          value={coachCredits}
          hint={
            <InfoTip label="What are my credits?" align="left">
              Your personal balance — 1 credit = 1 AI shot analysis. Credits
              you buy or that your organization gives you personally land
              here. Spend them on your own uploads or hand them to players
              as tokens.
            </InfoTip>
          }
        />

        <StatCard
          label="Team credits"
          value={team.credits}
          hint={
            <InfoTip label="What are team credits?" align="left">
              A shared balance that belongs to the team — usually funded by
              your organization. Spend them on this team&apos;s players (or
              your own uploads once your personal credits run out).
            </InfoTip>
          }
        />

        <StatCard
          label="Token pool"
          value={team.tokenPool}
          hint={
            <InfoTip label="What is the token pool?">
              Analysis tokens the team owns but hasn&apos;t handed out yet
              (like the free tokens from activation). Assign them to players
              in the Tokens &amp; Credits tab — players then spend their own
              tokens when they upload a shot.
            </InfoTip>
          }
        />

        {/* Web credit pricing does not exist inside the iOS app — IAP has its
            own prices, so quoting $2.49 here reads as a broken discount. */}
        {!inApp && (
          <StatCard
            label="Credit price"
            value={`$${creditRate}`}
            note={
              onTeamRate
                ? <span className="text-green-600 dark:text-green-400">team rate active</span>
                : <span className="text-gray-500 dark:text-chalk-dim">regular rate</span>
            }
            hint={
              <InfoTip label="How is the credit price set?" align="right">
                {onTeamRate ? (
                  <>Your organization plan earns the team rate: ${creditRate} per
                  credit, dropping to {firstStepRate} each when you buy{' '}
                  {firstStep.minQty} or more in one order.</>
                ) : (
                  <>This team isn&apos;t on an organization plan, so credits are
                  the regular ${creditRate} each — the same price anyone pays —
                  dropping to {firstStepRate} each when you buy {firstStep.minQty}{' '}
                  or more in one order. The lower team rate comes with an
                  organization plan.</>
                )}
              </InfoTip>
            }
          />
        )}
      </StatGrid>
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
          // Program sits next to Chat: it is week-to-week coaching work, not
          // billing. Hidden in the app only when there is nothing to run —
          // an enrolled team still wants its progress courtside.
          ...(classProgram || !inApp ? [{ id: 'program', label: 'Program', content: programTab }] : []),
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
    </DashboardShell>
  )
}
