'use client'

import { useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useIsInApp } from '@/lib/useIsInApp'
import Link from 'next/link'
import CoachUploadForm from './CoachUploadForm'
import CsvPlayerImport from '@/components/CsvPlayerImport'
import { PlayerStatusBadge, ResendSetupButton } from '@/components/PlayerSetupStatus'
import SendSetupToAllButton from '@/components/SendSetupToAllButton'
import GiveOwnAccountButton, { SharedEmailNote, membersSharingEmail } from '@/components/GiveOwnAccountButton'
import TeamCoaches from './TeamCoaches'
import CoachAssignPanel from '@/components/CoachAssignPanel'
import TokenBalances from '@/components/TokenBalances'
import ReturnCreditsPanel from '@/components/ReturnCreditsPanel'
import LeaderboardTable from '@/components/LeaderboardTable'
import LeaderboardVisibilitySwitch, { leaderboardTabLabel, type LeaderboardVisibility } from '@/components/LeaderboardVisibilitySwitch'
import PrintButton from '@/components/PrintButton'
import InlineEdit from '@/components/InlineEdit'
import PlayerShotList, { type Shot } from '@/components/PlayerShotList'
import InfoTip from '@/components/InfoTip'
import AccountTabs from '@/components/account/AccountTabs'
import ClassManager, { type ClassManagerPackage } from '@/components/ClassManager'
import BillingHistory from '@/components/BillingHistory'
import TeamChatPanel from '@/components/TeamChatPanel'
import PlayerEmailComposer from '@/components/player-email/PlayerEmailComposer'
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
import { ArrowRightIcon, Building2Icon, LogOutIcon, UploadIcon } from 'lucide-react'
import type { TeamRosterEntry } from '@/lib/team-roster-refs'
import { CLASS_ANALYSES_PER_PLAYER } from '@/lib/org-class-pricing'

const noopSubscribe = () => () => {}

interface Team {
  id: string
  name: string
  accessCode: string
  credits: number
  tokenPool: number
  /** What this team pays for tokens, and which features it may use. */
  tier: OrgTier
  /** 'team' = players see the ranked board; 'hidden' = only their own scores. */
  leaderboardVisibility: LeaderboardVisibility
}

interface LeaderboardEntry {
  id: string
  first_name: string
  last_name_initial: string
  kind: 'member' | 'player'
  best_score: number
  avg_score: number | string | null
  upload_count: number
  /** Same-name players only: what tells them apart (lib/team-shots.ts withTwinDetails). */
  detail?: string
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
  roster_pending?: boolean
  /** Set when the player holds a live club membership seat ('player' | 'pro'). */
  club_plan?: string | null
  club_ends_at?: string | null
}

interface PendingMember {
  id: string
  first_name: string
  last_name_initial: string | null
  invite_token: string | null
  /** A sibling's family address this name-only player is emailed at. */
  contact_email?: string | null
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
  /** Name of the organization this team belongs to, or null. */
  orgName: string | null
  myUploads: Shot[]
  coachCredits: number
  /** The 10-Week Shooting Class this team is running, or null if it isn't. */
  classProgram: (ClassManagerPackage & { tokenPool: number }) | null
  /** Every roster row with its stable upload ref (lib/team-roster-refs.ts). */
  uploadRoster: TeamRosterEntry[]
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
  orgName,
  myUploads,
  coachCredits,
  classProgram,
  uploadRoster,
}: Props) {
  const router = useRouter()
  const { clear: clearCart } = useCart()
  const inApp = useIsInApp()
  const [buying, setBuying] = useState(false)
  const [quantity, setQuantity] = useState(10)
  const [customQty, setCustomQty] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [leaderboardVisibility, setLeaderboardVisibility] = useState<LeaderboardVisibility>(team.leaderboardVisibility)
  const [kicking, setKicking] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)

  // Bulk grant state: one-click 'give N to every joined player'.
  const [bulkGrantEach, setBulkGrantEach] = useState(2)
  const [bulkGranting, setBulkGranting] = useState(false)
  const [bulkGrantMsg, setBulkGrantMsg] = useState('')

  // Add player form
  const [addOpen, setAddOpen] = useState(false)
  const [addFirst, setAddFirst] = useState('')
  const [addLast, setAddLast] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addParent, setAddParent] = useState('')
  const [addPhone, setAddPhone] = useState('')
  // Only asked once an email is typed; off means "add now, email them later".
  const [addSendEmail, setAddSendEmail] = useState(true)
  const [addStatus, setAddStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [addError, setAddError] = useState('')
  const [addMessage, setAddMessage] = useState('')
  const [addWarning, setAddWarning] = useState('')
  // 'info' for outcomes that need a second look (email already used by a
  // sibling, already on the team) rather than a plain success.
  const [addTone, setAddTone] = useState<'ok' | 'info'>('ok')
  // A same-named player without an email is already on the team: the form
  // stays filled so "Add anyway" can resend it unchanged.
  const [addNameMatch, setAddNameMatch] = useState(false)
  const [newInviteUrl, setNewInviteUrl] = useState('')
  const [copiedInvite, setCopiedInvite] = useState(false)

  // Per-pending-player invite copy state
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedSignup, setCopiedSignup] = useState(false)

  // The server snapshot is used while hydrating, then the real origin — a
  // plain `typeof window` check rendered different text on each side.
  const BASE_URL = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => 'https://learnhoops.com',
  )
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
      setBulkGrantMsg(`Need ${total} team tokens, team has ${team.credits}.`)
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
    const m = members.find(x => x.id === userId)
    if (!confirm(`Remove ${m ? pickLabel(m) : 'this player'} from ${team.name}?`)) return
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
    const p = pendingMembers.find(x => x.id === playerId)
    const who = p ? formatPlayerName(p.first_name, p.last_name_initial) : 'this player'
    if (!confirm(`Remove ${who} from ${team.name}? They were added by name and haven’t joined yet.`)) return
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

  // Picker label: lookalike names ("Jayden M." twice) get the email.
  function pickLabel(m: (typeof members)[number]): string {
    const name = m.first_name ? formatPlayerName(m.first_name, m.last_name_initial) : m.email
    const twin = members.some(o => o.id !== m.id && (o.first_name ? formatPlayerName(o.first_name, o.last_name_initial) : o.email).toLowerCase() === name.toLowerCase())
    return twin && name !== m.email ? `${name} (${m.email})` : name
  }

  function resetAddFeedback() {
    setAddStatus('idle')
    setAddError('')
    setAddMessage('')
    setAddWarning('')
    setAddNameMatch(false)
    setNewInviteUrl('')
  }

  async function addPlayer(e?: React.FormEvent, allowDuplicateName = false) {
    e?.preventDefault()
    setAddStatus('loading')
    setAddError('')
    setNewInviteUrl('')
    setAddMessage('')
    setAddWarning('')
    setAddNameMatch(false)
    try {
      const res = await fetch('/api/team/add-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: addFirst,
          // The server keeps only the initial; the full name is what a coach
          // naturally types, and it reads better in the setup email.
          lastName: addLast.trim() || undefined,
          email: addEmail.trim() || undefined,
          parentName: addParent.trim() || undefined,
          phone: addPhone.trim() || undefined,
          sendEmail: addSendEmail,
          allowDuplicateName: allowDuplicateName || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddError(data.error || 'Could not add the player. Please try again.')
        setAddStatus('error')
        return
      }
      setAddMessage(data.message || 'Player added.')
      setAddWarning(data.warning || '')
      setAddTone(data.status === 'already_on_team' ? 'info' : 'ok')
      // Only a name-only player's join link is ever shown. A player added
      // with an email gets their setup link in their own inbox — coaches
      // never see it.
      const shareable = data.status === 'invited' || (data.status === 'already_on_team' && data.nameMatch)
      setNewInviteUrl(shareable ? data.inviteUrl || '' : '')
      setAddStatus('success')
      if (data.status === 'already_on_team' && data.nameMatch) {
        setAddNameMatch(true)
        return
      }
      setAddFirst('')
      setAddLast('')
      setAddEmail('')
      setAddParent('')
      setAddPhone('')
      router.refresh()
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
  // The three setup states, matching the badges. A player added with an
  // email who hasn't opened their setup link is NOT "joined" yet.
  const readyMembers = members.filter(m => !m.roster_pending)
  const setupMembers = members.filter(m => m.roster_pending)
  const rosterSummary = [
    `${readyMembers.length} ready`,
    setupMembers.length > 0 ? `${setupMembers.length} setup pending` : null,
    pendingMembers.length > 0 ? `${pendingMembers.length} no email` : null,
  ].filter(Boolean).join(' · ')

  // Bulk upload needs a real screen; the bulk page itself accepts 900px+
  // with a mouse, so the entry points use the same breakpoint.
  const bulkUploadCard = (
    <div className="hidden min-[900px]:flex items-center gap-4 rounded-2xl border border-gray-200 dark:border-courtline bg-white dark:bg-ink-900 px-5 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ember-50 dark:bg-ember-500/10 text-ember-600 dark:text-ember-400">
        <UploadIcon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-gray-900 dark:text-chalk">Upload a whole session</p>
        <p className="text-xs text-gray-500 dark:text-chalk-dim">
          Drop in every clip from practice at once, check who each one belongs to, then grade them in one go.
        </p>
      </div>
      <Link href="/team/dashboard/bulk" className={backendButton('primary', 'shrink-0')}>
        Start bulk upload
        <ArrowRightIcon aria-hidden />
      </Link>
    </div>
  )

  // Siblings on this team with their own accounts on one family email.
  const sharedEmailIds = membersSharingEmail(members)

  // Graded shots per roster row, from the upload roster already loaded
  // (lib/team-roster-refs.ts), so "who hasn't uploaded" shows on the roster.
  const shotsByRef = new Map(uploadRoster.map(r => [r.ref, r.shotCount]))
  function shotsLabel(ref: string) {
    const n = shotsByRef.get(ref) ?? 0
    return n > 0 ? `${n} shot${n === 1 ? '' : 's'}` : 'No shots yet'
  }

  function memberRow(m: Member) {
    return (
      <div key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 px-3 bg-white dark:bg-ink-900 rounded-xl border border-gray-200 dark:border-courtline">
        {/* Wraps the actions under the name on a phone instead of letting
            the badge and "Resend setup email" collide. */}
        <div className="flex-1 min-w-[11rem]">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <Link
              href={`/team/dashboard/member/${m.id}`}
              className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-chalk hover:text-ember-600 dark:hover:text-ember-400 hover:underline transition-colors"
            >
              {m.first_name ? formatPlayerName(m.first_name, m.last_name_initial) : m.email}
            </Link>
            <PlayerStatusBadge status={m.roster_pending ? 'pending' : 'active'} />
            {sharedEmailIds.has(m.id) && <SharedEmailNote />}
            {m.club_plan && (
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400 whitespace-nowrap"
                title={m.club_ends_at ? `Paid for by the club until ${new Date(new Date(m.club_ends_at).getTime() - 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}` : 'Paid for by the club'}
              >
                Club membership · {m.club_plan === 'pro' ? 'Pro' : 'Player'}
              </span>
            )}
          </div>
          {m.first_name && <p className="text-xs text-gray-500 dark:text-chalk-dim truncate">{m.email}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-auto">
          {m.roster_pending && (
            <ResendSetupButton endpoint="/api/team/resend-player-setup" userId={m.id} />
          )}
          <span className="text-xs text-gray-500 dark:text-chalk-dim tabular-nums">{shotsLabel(`member:${m.id}`)}</span>
          <span className="text-xs text-gray-500 dark:text-chalk-dim tabular-nums">{m.tokens} token{m.tokens !== 1 ? 's' : ''}</span>
          <button
            onClick={() => kickMember(m.id)}
            disabled={kicking === m.id}
            className="text-xs font-semibold text-gray-400 dark:text-chalk-dim hover:text-red-500 disabled:opacity-50 transition-colors"
          >
            {kicking === m.id ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    )
  }

  function rosterGroup(label: string, count: number, rows: React.ReactNode[], note?: string, action?: React.ReactNode) {
    if (count === 0) return null
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">
          {label} <span className="tabular-nums text-gray-400 dark:text-chalk-dim">({count})</span>
        </p>
        {note && <p className="text-xs text-gray-500 dark:text-chalk-dim">{note}</p>}
        {action && <div className="py-1">{action}</div>}
        {rows}
      </div>
    )
  }

  /* ── Players tab ──────────────────────────────────────────────── */
  const playersTab = (
    <div className="space-y-4">
      {rosterCount > 0 && bulkUploadCard}
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
            <p className="text-xl font-bold font-mono tracking-widest text-gray-900 dark:text-chalk mt-0.5">{team.accessCode}</p>
          </div>
        </div>
      </Section>

      <Section
        title="Roster"
        tipLabel="Who shows up on the roster?"
        tip="Account ready: the player has set up their login. Setup not finished: you added them with an email and they haven't opened the setup link yet. Name only: added without an account — they join with their invite link. Brothers and sisters can each have their own account on one family email. A name-only player listed with a family email can be given their own account there."
        summary={rosterSummary}
      >
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-gray-500 dark:text-chalk-dim">
              {rosterCount > 0
                ? 'Tap a player to see their shot history.'
                : 'No players yet. Add one here, or share the invite link or team code above.'}
            </p>
            <button
              onClick={() => { setAddOpen(o => !o); resetAddFeedback() }}
              className={addOpen ? backendButton('quiet', 'shrink-0') : backendButton('primary', 'shrink-0')}
            >
              {addOpen ? 'Close' : 'Add player'}
            </button>
          </div>

          {/* Always visible (it opens its own panel), rather than hidden
              inside the Add player form where coaches never found it. */}
          <CsvPlayerImport endpoint="/api/team/import-players" teamName={team.name} />

          {addOpen && (
            <div className="bg-white dark:bg-ink-900 border border-gray-200 dark:border-courtline rounded-2xl p-5 space-y-3">
              {/* Same wording as the org's AddPlayerForm. */}
              <p className="text-sm text-gray-500 dark:text-chalk-dim">
                No password needed. {!addEmail.trim()
                  ? 'Add an email to create their account and send results; without one they join with an invite link you share.'
                  : addSendEmail
                    ? 'We email them a link to finish setting up their own account. The link goes only to that inbox. Brothers and sisters can share one family email; each still gets their own account.'
                    : 'Their account is created now; you can send the setup email later from the roster.'}
              </p>
              <form onSubmit={addPlayer} className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    aria-label="First name"
                    placeholder="First name *"
                    value={addFirst}
                    onChange={e => setAddFirst(e.target.value)}
                    className="bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-3 text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors"
                  />
                  <input
                    type="text"
                    aria-label="Last name"
                    placeholder="Last name"
                    value={addLast}
                    onChange={e => setAddLast(e.target.value)}
                    className="bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-3 text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors"
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-chalk-dim">Only the first letter of the last name shows on the roster and leaderboard.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input type="email" aria-label="Email" placeholder="Email (optional)" value={addEmail} onChange={e => setAddEmail(e.target.value)} className="bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-2.5 text-black dark:text-chalk text-sm placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors" />
                  <input type="text" aria-label="Parent name" placeholder="Parent name (optional)" value={addParent} onChange={e => setAddParent(e.target.value)} className="bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-2.5 text-black dark:text-chalk text-sm placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors" />
                  <input type="text" aria-label="Phone" placeholder="Phone (optional)" value={addPhone} onChange={e => setAddPhone(e.target.value)} className="bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-2.5 text-black dark:text-chalk text-sm placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors" />
                </div>
                {addEmail.trim() && (
                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-chalk-dim cursor-pointer">
                    <input type="checkbox" checked={addSendEmail} onChange={e => setAddSendEmail(e.target.checked)} className="w-4 h-4 accent-ember-500" />
                    Email them a link to finish setting up their account
                  </label>
                )}
                {addError && <p className="text-red-500 text-sm">{addError}</p>}
                <button
                  type="submit"
                  disabled={addStatus === 'loading'}
                  className="bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-bold px-4 py-2 rounded-xl text-sm transition-colors"
                >
                  {addStatus === 'loading' ? 'Adding…' : 'Add player'}
                </button>
              </form>

              {addStatus === 'success' && (
                <div
                  role="status"
                  className={`rounded-xl p-4 space-y-2 border ${addTone === 'ok'
                    ? 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900'
                    : 'bg-gray-50 dark:bg-ink-800 border-gray-200 dark:border-courtline'}`}
                >
                  <p className={`text-sm font-semibold ${addTone === 'ok' ? 'text-green-700 dark:text-green-400' : 'text-gray-800 dark:text-chalk'}`}>{addMessage}</p>
                  {addWarning && <p className="text-sm text-amber-700 dark:text-amber-400">{addWarning}</p>}
                  {newInviteUrl && (
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-xs font-mono text-gray-600 dark:text-chalk-dim truncate">{newInviteUrl}</span>
                      <button
                        onClick={copyNewInviteUrl}
                        className="shrink-0 text-sm font-semibold text-ember-600 dark:text-ember-400 hover:text-ember-500 transition-colors"
                      >
                        {copiedInvite ? 'Copied' : 'Copy invite link'}
                      </button>
                    </div>
                  )}
                  {addNameMatch && (
                    <div className="flex items-center gap-4 pt-0.5">
                      <button
                        onClick={() => addPlayer(undefined, true)}
                        className="text-sm font-semibold text-ember-600 dark:text-ember-400 hover:text-ember-500"
                      >
                        Add anyway (different player)
                      </button>
                      <button
                        onClick={resetAddFeedback}
                        className="text-sm font-semibold text-gray-500 dark:text-chalk-dim hover:text-gray-700 dark:hover:text-chalk"
                      >
                        Don&rsquo;t add
                      </button>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

          {rosterGroup('Account ready', readyMembers.length, readyMembers.map(memberRow))}
          {rosterGroup('Setup not finished', setupMembers.length, setupMembers.map(memberRow),
            'Added with an email. They get a link to set up their account — resend it if it got lost.',
            <SendSetupToAllButton endpoint="/api/team/resend-player-setup-all" count={setupMembers.filter(m => m.email).length} extra={{ teamId: team.id }} />)}
          {rosterGroup('Name only (no account)', pendingMembers.length, pendingMembers.map(p => {
            const inviteUrl = p.invite_token ? `${BASE_URL}/signup?teamInvite=${p.invite_token}` : null
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 px-3 bg-white dark:bg-ink-900 rounded-xl border border-gray-200 dark:border-courtline">
                <div className="flex flex-1 flex-wrap items-center gap-2 min-w-[11rem]">
                  <span className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-chalk">
                    {formatPlayerName(p.first_name, p.last_name_initial)}
                  </span>
                  <PlayerStatusBadge status="invited" />
                  {p.contact_email && (
                    <span className="basis-full text-xs text-gray-500 dark:text-chalk-dim [overflow-wrap:anywhere]">
                      Family email {p.contact_email} (shared with a sibling)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-auto">
                <span className="text-xs text-gray-500 dark:text-chalk-dim tabular-nums">{shotsLabel(`pending:${p.id}`)}</span>
                {p.contact_email && (
                  <GiveOwnAccountButton
                    endpoint="/api/team/give-own-account"
                    pendingId={p.id}
                    playerName={p.first_name}
                    email={p.contact_email}
                  />
                )}
                {inviteUrl && (
                  <button
                    onClick={() => copyInviteUrl(inviteUrl, p.id)}
                    className="text-xs font-semibold text-ember-600 dark:text-ember-400 hover:text-ember-500 transition-colors shrink-0"
                  >
                    {copiedId === p.id ? 'Copied' : 'Copy invite link'}
                  </button>
                )}
                <button
                  onClick={() => cancelPendingPlayer(p.id)}
                  disabled={cancelling === p.id}
                  className="text-xs font-semibold text-gray-400 dark:text-chalk-dim hover:text-red-500 disabled:opacity-50 transition-colors shrink-0"
                >
                  {cancelling === p.id ? 'Removing…' : 'Remove'}
                </button>
                </div>
              </div>
            )
          }), 'Added by name only. Share their invite link so they can join, or remove them and add them again with an email.')}
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
            teamName={team.name}
            isHeadCoach={adminEmail.toLowerCase() === foundingCoachEmail.toLowerCase()}
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
      {bulkUploadCard}

      <Section
        title="Upload a shot for a player"
        tipLabel="How do coach uploads work?"
        tip="Record a player's shot and upload it here — it spends one of your tokens and the analysis is filed under that player on the leaderboard. Players with the same name are listed separately, so pick by the email or details under the name."
        defaultOpen
      >
        <div className="pt-2">
          <CoachUploadForm accessCode={team.accessCode} players={uploadRoster} />
        </div>
      </Section>

      <Section
        title="My uploads"
        tipLabel="What counts as my upload?"
        tip="Shots you analyzed for yourself (not on behalf of a player). Uploads you make for players live on each player's page instead."
        summary={`${myUploads.length} shot${myUploads.length !== 1 ? 's' : ''}`}
      >
        <div className="space-y-3 pt-2">
          <div className="flex flex-wrap justify-end gap-2">
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
      <LeaderboardVisibilitySwitch
        teamId={team.id}
        visibility={leaderboardVisibility}
        onChange={setLeaderboardVisibility}
      />
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
                    <span className={`font-bold ml-auto ${gain >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
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
    </div>
  ) : (
    <div className="rounded-2xl border border-gray-200 dark:border-courtline p-5">
      <h3 className="font-bold text-black dark:text-chalk">Coach-Led Development Program</h3>
      <p className="text-sm text-gray-600 dark:text-chalk-dim mt-1.5 leading-relaxed">
        Ten structured sessions that take a player from a baseline shot analysis
        through grip, elbow, stance, release and arc, to a final evaluation and a
        certificate. Every place includes {CLASS_ANALYSES_PER_PLAYER} analyses and a training ball.
      </p>
      {/* Buying a package always creates a new class team; an existing team
          is never switched over to it. */}
      <p className="text-sm text-gray-600 dark:text-chalk-dim mt-3 leading-relaxed">
        {orgName
          ? 'Your club runs this program on its own class team, not on this one. To coach it, ask your director to add you to the class team.'
          : 'The class runs through an organization — a club, school or academy buys the places, and each package gets its own class team. This team isn’t part of one, so there’s nothing to run here. If your club has a LearnHoops organization, ask your director to add you as the coach of its class team.'}
      </p>
    </div>
  )

  /* ── Tokens & Credits tab ─────────────────────────────────────── */
  const settingsTab = (
    <div className="space-y-4">
      <AppearanceSection />
    </div>
  )

  const billingTab = (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-chalk">Purchase history</h2>
        <p className="text-sm text-gray-500 dark:text-chalk-dim mt-1">
          Your purchases — tokens for yourself and for this team. Receipts are
          emailed at checkout.
        </p>
      </div>
      <BillingHistory
        endpoint="/api/team/billing"
        emptyAction={!inApp ? (
          <button
            onClick={() => document.querySelector<HTMLButtonElement>('[data-tab="credits"]')?.click()}
            className="bg-ember-500 hover:bg-ember-400 text-ink-950 font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
          >
            Buy your first tokens
          </button>
        ) : undefined}
      />
    </div>
  )

  const creditsTab = (
    <div className="space-y-4">
      {/* Quick grant — class-style "give every joined player N credits" in
          one click, paid out of the team's credit pool. Shown when there's
          at least one player. */}
      {members.length > 0 && (
        <div className="bg-ember-50 dark:bg-ember-500/10 border border-ember-200 dark:border-ember-500/30 rounded-2xl p-5 space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="font-bold text-black dark:text-chalk">Give tokens to every player</p>
              {team.credits >= bulkGrantEach * members.length ? (
                <p className="text-xs text-gray-600 dark:text-chalk-dim mt-0.5">
                  Uses <span className="font-bold text-ember-600 dark:text-ember-400">{bulkGrantEach * members.length}</span> of this team&apos;s {team.credits} team tokens to give every player {bulkGrantEach} token{bulkGrantEach !== 1 ? 's' : ''}.
                </p>
              ) : (
                <p className="text-xs text-gray-600 dark:text-chalk-dim mt-0.5">
                  Needs <span className="font-bold text-ember-600 dark:text-ember-400">{bulkGrantEach * members.length}</span> team tokens, and this team has {team.credits}. Ask your organization for more team tokens, or give from your own tokens under Give tokens to players below.
                </p>
              )}
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
                      : 'bg-white dark:bg-ink-900 text-black dark:text-chalk border border-ember-200 dark:border-courtline hover:border-ember-400'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={grantToAll}
                disabled={bulkGranting || team.credits < bulkGrantEach * members.length}
                className="bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-bold text-sm px-4 py-2.5 rounded-xl transition-colors"
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
          title="Buy tokens"
          tipLabel="What do tokens pay for?"
          tip="1 token = 1 AI shot analysis. Purchases land in My tokens, your personal balance. Your uploads (your own shots and shots for players) use these first, then the team's tokens. You can also hand them to any player."
          summary={`$${creditRate} per token`}
        >
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-600 dark:text-chalk-dim">
              ${creditRate} per token
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
                aria-label="Custom token amount"
                className="w-full py-2.5 px-3 border border-gray-300 dark:border-courtline rounded-xl text-black dark:text-chalk text-sm placeholder:text-gray-400 dark:placeholder:text-chalk-dim placeholder:font-normal focus:outline-none focus:border-ember-500"
              />
            </div>

            <VolumeTierList tier={tier} className="px-1" />

            <VolumeSavings
              tier={tier}
              quantity={quantity}
              label="token"
              onJump={(q) => { setQuantity(Math.min(500, q)); setCustomQty('') }}
            />

            <button
              onClick={buyCredits}
              disabled={buying}
              className="w-full bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-bold py-3 rounded-xl transition-colors"
            >
              {buying
                ? 'Redirecting to checkout…'
                : `Buy ${quantity} Token${quantity !== 1 ? 's' : ''} — ${usd(orderPricing(tier, quantity).totalCents)}`}
            </button>
          </div>
        </Section>
      )}

      <Section
        title="Give tokens to players"
        tipLabel="Which balance pays?"
        tip="Pick the balance to pay from: My tokens are your own, Team tokens are shared and usually funded by your organization, and Unassigned team tokens are ones the team hasn't handed out yet (like the free activation tokens). Each token is one shot analysis the player can run themselves."
        summary={`${coachCredits} mine · ${team.credits} team${team.tokenPool > 0 ? ` · ${team.tokenPool} unassigned` : ''}`}
      >
        <div className="pt-2">
          <CoachAssignPanel
            personalCredits={coachCredits}
            teamCredits={team.credits}
            tokenPool={team.tokenPool}
            players={members.map(m => ({
              id: m.id,
              label: pickLabel(m),
              tokens: m.tokens,
            }))}
          />
        </div>
      </Section>

      <Section
        title="Balances"
        tipLabel="Team tokens vs. player tokens?"
        tip="Team tokens belong to the team and haven't been handed out yet (some older teams also show unassigned team tokens). Once you give them to a player, they become that player's tokens — each token is one shot analysis the player can run themselves."
        summary={`${team.credits} team · ${members.reduce((sum, m) => sum + m.tokens, 0)} with players`}
      >
        <div className="space-y-4 pt-2">
          <TokenBalances
            players={members.map(m => ({
              id: m.id,
              label: pickLabel(m),
              tokens: m.tokens,
            }))}
            teamCredits={team.credits}
            tokenPool={team.tokenPool}
          />
        </div>
      </Section>

      {/* Only teams that belong to an organization have somewhere to return to. */}
      {orgName && (
        <Section
          title="Return tokens to your organization"
          tipLabel="How does returning tokens work?"
          tip={`Sends your tokens or the team's team tokens back to ${orgName} so the organization can redistribute them. Tokens already handed to players stay with those players.`}
          summary={`to ${orgName}`}
        >
          <div className="pt-2">
            <ReturnCreditsPanel
              orgName={orgName}
              personalCredits={coachCredits}
              teamCredits={team.credits}
            />
          </div>
        </Section>
      )}
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
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Switch team">
            <span className="text-xs font-semibold text-gray-500 dark:text-chalk-dim mr-1">Switch team:</span>
            {allTeams.map(t => (
              <button
                key={t.id}
                onClick={() => {
                  if (t.id !== currentTeamId) {
                    fetch('/api/team/select', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      // No email in the body: /api/team/select reads the
                      // coach's identity from this session, not from us.
                      body: JSON.stringify({ teamId: t.id }),
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
              Players enter this code (or use the invite link in the Players
              tab) to join your team&apos;s roster. Only share it with your
              own players — anyone with the code can join.
            </InfoTip>
          }
        />

        {/* Not shown to an organization that opened this team: its uploads
            are paid from team tokens, then organization tokens, never these. */}
        {!fromOrg && (
          <StatCard
            label="My tokens"
            value={coachCredits}
            hint={
              <InfoTip label="What are my tokens?" align="left">
                Your personal balance — 1 token = 1 AI shot analysis. Tokens
                you buy or that your organization gives you personally land
                here. Uploads you make use these first, then the team&apos;s
                tokens. You can also hand them to players.
              </InfoTip>
            }
          />
        )}

        <StatCard
          label="Team tokens"
          value={team.credits}
          hint={
            <InfoTip label="What are team tokens?" align="left">
              A shared balance that belongs to the team — usually funded by
              your organization. Your uploads use it once your own tokens run
              out (organization uploads use it first). You can also give it
              to this team&apos;s players.
            </InfoTip>
          }
        />

        {/* Legacy unassigned pool — a card only while it still holds tokens.
            Hidden on class teams, whose tokens are Team tokens. */}
        {team.tokenPool > 0 && !classProgram && <StatCard
          label="Unassigned team tokens"
          value={team.tokenPool}
          hint={
            <InfoTip label="What are unassigned team tokens?">
              Analysis tokens the team owns but hasn&apos;t handed out yet
              (like the free tokens from activation). Assign them to players
              in the Tokens tab — players then spend their own
              tokens when they upload a shot.
            </InfoTip>
          }
        />}

        {/* Web credit pricing does not exist inside the iOS app — IAP has its
            own prices, so quoting $2.49 here reads as a broken discount. */}
        {!inApp && (
          <StatCard
            label="Token price"
            value={`$${creditRate}`}
            note={
              onTeamRate
                ? <span className="text-green-600 dark:text-green-400">team rate active</span>
                : <span className="text-gray-500 dark:text-chalk-dim">regular rate</span>
            }
            hint={
              <InfoTip label="How is the token price set?" align="right">
                {onTeamRate ? (
                  <>Your organization plan earns the team rate: ${creditRate} per
                  token, dropping to {firstStepRate} each when you buy{' '}
                  {firstStep.minQty} or more in one order.</>
                ) : (
                  <>This team isn&apos;t on an organization plan, so tokens are
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
          { id: 'email', label: 'Email Players', content: <PlayerEmailComposer key={team.id} as="coach" /> },
          { id: 'uploads', label: 'Uploads', content: uploadsTab },
          { id: 'leaderboard', label: leaderboardTabLabel(leaderboardVisibility), count: leaderboard.length, content: leaderboardTab },
          // Program sits next to Chat: it is week-to-week coaching work, not
          // billing. Hidden in the app only when there is nothing to run —
          // an enrolled team still wants its progress courtside.
          ...(classProgram || !inApp ? [{ id: 'program', label: 'Program', content: programTab }] : []),
          { id: 'credits', label: 'Tokens', content: creditsTab },
          { id: 'billing', label: 'Purchases', content: billingTab },
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
              <h2 className="text-xl font-bold text-black dark:text-chalk">{team.name} Leaderboard</h2>
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
