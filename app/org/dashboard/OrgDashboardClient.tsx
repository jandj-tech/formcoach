'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useIsInApp } from '@/lib/useIsInApp'
import Link from 'next/link'
import OrgAddCoach from './OrgAddCoach'
import AccountTabs from '@/components/account/AccountTabs'
import ClassManager from '@/components/ClassManager'
import BillingHistory from '@/components/BillingHistory'
import Section from '@/components/account/Section'
import InfoTip from '@/components/InfoTip'
import TokenBalances from '@/components/TokenBalances'
import InlineEdit from '@/components/InlineEdit'
import LeaderboardTable, { type LeaderboardRow } from '@/components/LeaderboardTable'
import SortMenu, { type SortOption } from '@/components/SortMenu'
import type { OrgTier } from '@/lib/team-pricing'
import OrgTokenPanel from '@/components/OrgTokenPanel'
import TeamChatPanel from '@/components/TeamChatPanel'
import EmailTeamPanel from '@/components/EmailTeamPanel'
import PlayerShotList, { type Shot } from '@/components/PlayerShotList'
import PrintButton from '@/components/PrintButton'
import TeamSchedulePanel from '@/components/TeamSchedulePanel'
import { CLASS_MIN_PLAYERS, CLASS_BULK_THRESHOLD, classPriceCents } from '@/lib/org-class-pricing'
import { copyToClipboard } from '@/lib/copy'
import AppearanceSection from '@/components/account/AppearanceSection'
import { backendButton } from '@/components/backend/button-styles'
import {
  ArrowRightIcon,
  MailIcon,
  MessageSquareIcon,
  TargetIcon,
  TrophyIcon,
} from 'lucide-react'
import { BasketballIcon } from '@/components/backend/BasketballIcon'

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
  nickname: string | null
}

interface TeamData {
  id: string
  name: string
  ageGroup: string | null
  accessCode: string
  adminEmail: string
  credits: number
  classPackageId: string | null
  members: Member[]
  coaches: Coach[]
  coachNickname: string | null
  tokenPool: number
  leaderboard: LeaderboardRow[]
}

export interface ClassEnrollment {
  id: string
  user_id: string | null
  first_name: string | null
  last_name_initial: string | null
  first_score: number | null
  final_score: number | null
  display_final_score: number | null
  is_first_class: boolean
  certificate_issued_at: string | null
  has_first: boolean
  has_final: boolean
  tokens: number
}

export interface ClassPackage {
  id: string
  player_count: number
  price_per_player_cents: number
  total_cents: number
  token_pool: number
  status: string
  created_at: string
  enrolled_count: number
  completed_count: number
  team_access_code: string | null
  enrollments: ClassEnrollment[]
}

interface Props {
  teams: TeamData[]
  orgName: string
  classPackages: ClassPackage[]
  myUploads: Shot[]
  orgTokenBalance: number
  /** The organization plan — sets the token rate and which features are open. */
  orgTier: OrgTier
}


type PlayerSortMode = 'name' | 'score-desc' | 'score-asc'

const PLAYER_SORT_OPTIONS: SortOption<PlayerSortMode>[] = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'score-desc', label: 'Highest score' },
  { value: 'score-asc', label: 'Lowest score' },
]

export default function OrgDashboardClient({ teams, orgName, classPackages, myUploads, orgTokenBalance, orgTier }: Props) {
  const router = useRouter()
  const inApp = useIsInApp()
  const [expanded, setExpanded] = useState<string | null>(null)
  // destSelect: 'all' | 'coach' | userId — one dropdown replaces mode+checkboxes
  const [destSelect, setDestSelect] = useState<Record<string, string>>({})
  const [quantity, setQuantity] = useState<Record<string, number>>({})
  const [buyOpen, setBuyOpen] = useState<Record<string, boolean>>({})
  const [buying, setBuying] = useState(false)
  const [error, setError] = useState<Record<string, string>>({})
  const [copiedLink, setCopiedLink] = useState<Record<string, boolean>>({})
  const [removingCoach, setRemovingCoach] = useState<string | null>(null)
  const [removingPlayer, setRemovingPlayer] = useState<string | null>(null)
  const [deletingTeam, setDeletingTeam] = useState<string | null>(null)
  // Both lists now live in their own tabs, so they start expanded — the tab
  // itself is the collapse; the toggle stays for minimizing within the tab.
  const [showMyUploads, setShowMyUploads] = useState(false)
  const [showAllPlayers, setShowAllPlayers] = useState(false)
  const [playerSort, setPlayerSort] = useState<Record<string, PlayerSortMode>>({})
  const [allPlayersSort, setAllPlayersSort] = useState<PlayerSortMode>('name')
  const [teamLbModal, setTeamLbModal] = useState<string | null>(null)
  // Team id whose full month schedule is open in a modal.
  const [scheduleModal, setScheduleModal] = useState<string | null>(null)
  // Which team the Schedule tab is showing. Null until a team is picked, so it
  // falls back to the first team rather than pinning an id that may vanish.
  const [scheduleTeam, setScheduleTeam] = useState<string | null>(null)
  const [emailSelected, setEmailSelected] = useState<Record<string, boolean>>({})
  const [emailDraftTeam, setEmailDraftTeam] = useState<string | null>(null)
  const [emailCopied, setEmailCopied] = useState<'emails' | 'body' | null>(null)

  const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://learnhoops.com'

  // Class program: per ball-size counts; classPlayerCount = sum.
  // Seeds with the minimum on size 7 (men's) so the page loads with a valid order.
  const [classSize5, setClassSize5] = useState(0)
  const [classSize6, setClassSize6] = useState(0)
  const [classSize7, setClassSize7] = useState(CLASS_MIN_PLAYERS)
  const classPlayerCount = classSize5 + classSize6 + classSize7
  // Collapsed by default, like every other dashboard section.
  const [classProgramOpen, setClassProgramOpen] = useState(false)
  const [buyingClass, setBuyingClass] = useState(false)
  const [classError, setClassError] = useState('')
  // Roster enrollment, standings and progress resets now live in
  // <ClassManager> (the Class Manager tab), which owns that state.

  // Per-team "assign team credits to players" form state.
  const [teamAssignOpen, setTeamAssignOpen] = useState<Record<string, boolean>>({})
  const [teamAssignPicks, setTeamAssignPicks] = useState<Record<string, Record<string, boolean>>>({})
  const [teamAssignEach, setTeamAssignEach] = useState<Record<string, number>>({})
  const [teamAssignBusy, setTeamAssignBusy] = useState<string | null>(null)
  const [teamAssignMsg, setTeamAssignMsg] = useState<Record<string, string>>({})

  // Quick send from the always-visible org balance banner. Recipient values
  // are 'coach:<email>' (personal credits) or 'team:<id>' (shared credits).
  const [quickSendTo, setQuickSendTo] = useState('')
  const [quickSendQty, setQuickSendQty] = useState(5)
  const [quickSendBusy, setQuickSendBusy] = useState(false)
  const [quickSendMsg, setQuickSendMsg] = useState('')

  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAgeGroup, setNewAgeGroup] = useState('')
  const [newCoachEmail, setNewCoachEmail] = useState('')
  const [newCoachName, setNewCoachName] = useState('')
  const [addStatus, setAddStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [addError, setAddError] = useState('')
  const [addSuccessEmail, setAddSuccessEmail] = useState('')

  function getDestSelect(teamId: string): string {
    return destSelect[teamId] ?? 'all'
  }

  function getQty(teamId: string): number {
    return quantity[teamId] ?? 1
  }

  function copyLink(teamId: string, accessCode: string) {
    copyToClipboard(`${BASE_URL}/signup?teamCode=${accessCode}`, 'Signup link copied!').then(() => {
      setCopiedLink(prev => ({ ...prev, [teamId]: true }))
      setTimeout(() => setCopiedLink(prev => ({ ...prev, [teamId]: false })), 2000)
    })
  }

  function toggleEmailMember(userId: string) {
    setEmailSelected(prev => ({ ...prev, [userId]: !prev[userId] }))
  }

  function copyText(text: string, kind: 'emails' | 'body') {
    copyToClipboard(text, kind === 'emails' ? 'Emails copied!' : 'Email body copied!').then(() => {
      setEmailCopied(kind)
      setTimeout(() => setEmailCopied(null), 2000)
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

  async function removeHeadCoach(teamId: string) {
    if (!confirm('Remove the head coach? The next coach in line is promoted to head coach.')) return
    setRemovingCoach(`head-${teamId}`)
    try {
      const res = await fetch('/api/org/remove-head-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRemovingCoach(null)
        alert(data.error || 'Could not remove the head coach.')
        return
      }
      router.refresh()
    } catch {
      setRemovingCoach(null)
      alert('Something went wrong. Please try again.')
    }
  }

  async function removePlayer(teamId: string, userId: string) {
    if (!confirm('Remove this player from the team?')) return
    setRemovingPlayer(userId)
    try {
      const res = await fetch('/api/org/remove-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, userId }),
      })
      if (!res.ok) throw new Error('Failed')
      router.refresh()
    } catch {
      setRemovingPlayer(null)
      alert('Could not remove that player. Please try again.')
    }
  }

  async function deleteTeam(team: TeamData) {
    const leftover = team.tokenPool > 0 || team.credits > 0
      ? `\n\nHeads up: this team still has ${team.tokenPool} pool token${team.tokenPool !== 1 ? 's' : ''} and ${team.credits} coach credit${team.credits !== 1 ? 's' : ''} — these will be lost.`
      : ''
    if (!confirm(
      `Delete "${team.name}"? This permanently removes the team, its ${team.members.length} player${team.members.length !== 1 ? 's' : ''}, and its coaches. Players keep their own shot history.${leftover}`,
    )) return
    setDeletingTeam(team.id)
    try {
      const res = await fetch('/api/org/delete-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: team.id }),
      })
      if (!res.ok) throw new Error('Failed')
      router.refresh()
    } catch {
      setDeletingTeam(null)
      alert('Could not delete that team. Please try again.')
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
        body: JSON.stringify({ name: newName, ageGroup: newAgeGroup, coachEmail: newCoachEmail, coachName: newCoachName }),
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
      setNewCoachName('')
      setTimeout(() => router.refresh(), 2000)
    } catch {
      setAddError('Something went wrong. Please try again.')
      setAddStatus('error')
    }
  }

  async function assignTeamCreditsToPlayers(teamId: string, teamCredits: number) {
    const picks = teamAssignPicks[teamId] || {}
    const ids = Object.keys(picks).filter(id => picks[id])
    const each = Math.max(1, teamAssignEach[teamId] ?? 1)
    if (ids.length === 0) {
      setTeamAssignMsg(prev => ({ ...prev, [teamId]: 'Pick at least one player.' }))
      return
    }
    const total = ids.length * each
    if (total > teamCredits) {
      setTeamAssignMsg(prev => ({ ...prev, [teamId]: `Need ${total}, team has ${teamCredits}.` }))
      return
    }
    setTeamAssignBusy(teamId)
    setTeamAssignMsg(prev => ({ ...prev, [teamId]: '' }))
    try {
      const res = await fetch('/api/org/assign-from-team-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, playerUserIds: ids, tokensEach: each }),
      })
      const data = await res.json()
      if (!res.ok) {
        setTeamAssignMsg(prev => ({ ...prev, [teamId]: data.error || 'Could not assign credits.' }))
        setTeamAssignBusy(null)
        return
      }
      setTeamAssignPicks(prev => ({ ...prev, [teamId]: {} }))
      setTeamAssignMsg(prev => ({ ...prev, [teamId]: `Assigned ${total} credit${total !== 1 ? 's' : ''}.` }))
      setTeamAssignBusy(null)
      router.refresh()
    } catch {
      setTeamAssignMsg(prev => ({ ...prev, [teamId]: 'Something went wrong.' }))
      setTeamAssignBusy(null)
    }
  }

  async function quickSend() {
    if (!quickSendTo) {
      setQuickSendMsg('Choose a coach or team first.')
      return
    }
    const qty = Math.max(1, quickSendQty)
    if (qty > orgTokenBalance) {
      setQuickSendMsg(`Not enough tokens — need ${qty}, have ${orgTokenBalance}.`)
      return
    }
    const isCoach = quickSendTo.startsWith('coach:')
    setQuickSendBusy(true)
    setQuickSendMsg('')
    try {
      const res = await fetch(
        isCoach ? '/api/org/give-coach-credits' : '/api/org/allocate-team-credits',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            isCoach
              ? { coachEmail: quickSendTo.slice('coach:'.length), quantity: qty }
              : { teamId: quickSendTo.slice('team:'.length), quantity: qty },
          ),
        },
      )
      const data = await res.json()
      if (!res.ok) {
        setQuickSendMsg(data.error || 'Could not send credits.')
        setQuickSendBusy(false)
        return
      }
      setQuickSendMsg(
        isCoach
          ? `Sent ${qty} personal credit${qty !== 1 ? 's' : ''} to the coach.`
          : `Sent ${qty} team credit${qty !== 1 ? 's' : ''} to the team.`,
      )
      router.refresh()
    } catch {
      setQuickSendMsg('Something went wrong. Please try again.')
    }
    setQuickSendBusy(false)
  }

  async function openTeam(teamId: string) {
    try {
      const res = await fetch('/api/org/open-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      })
      if (!res.ok) {
        alert('Could not open that team. Please try again.')
        return
      }
      router.push('/team/dashboard')
    } catch {
      alert('Something went wrong. Please try again.')
    }
  }


  function memberDisplayName(m: Member) {
    if (m.first_name) {
      return `${m.first_name}${m.last_name_initial ? ' ' + m.last_name_initial + '.' : ''}`
    }
    return m.email
  }

  // Returns the team's members in the chosen sort order. A member's score is
  // their best score from the team leaderboard; members who haven't uploaded a
  // shot have no score and always sort to the bottom.
  function sortedMembers(team: TeamData): Member[] {
    const mode = playerSort[team.id] ?? 'name'
    const scoreOf = (m: Member): number | null => {
      const row = team.leaderboard.find(r => r.kind === 'member' && r.id === m.id)
      return row ? Number(row.best_score) : null
    }
    return [...team.members].sort((a, b) => {
      if (mode === 'name') return memberDisplayName(a).localeCompare(memberDisplayName(b))
      const sa = scoreOf(a)
      const sb = scoreOf(b)
      if (sa === null && sb === null) return memberDisplayName(a).localeCompare(memberDisplayName(b))
      if (sa === null) return 1
      if (sb === null) return -1
      return mode === 'score-desc' ? sb - sa : sa - sb
    })
  }

  // AccountTabs keys off data-tab buttons, so switching tab is a click.
  function goToTab(tabId: string) {
    document.querySelector<HTMLButtonElement>(`[data-tab="${tabId}"]`)?.click()
  }

  // Expand a team's panel and scroll to it — used from the All Players list.
  function goToTeam(teamId: string) {
    // The team cards live in the Teams tab; when clicking from the Players
    // tab, switch tabs first so the panel is visible before scrolling.
    document.querySelector<HTMLButtonElement>('[data-tab="teams"]')?.click()
    setExpanded(teamId)
    setTimeout(() => {
      document
        .getElementById(`team-panel-${teamId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  // Every player and coach across the org — feeds the token-distribution panel.
  const orgPlayers = teams.flatMap(t =>
    t.members.map(m => ({ id: m.id, label: memberDisplayName(m), team: t.name, teamId: t.id })),
  )
  const orgCoachMap = new Map<string, string>()
  for (const t of teams) {
    const head = t.adminEmail.toLowerCase()
    if (!orgCoachMap.has(head)) {
      orgCoachMap.set(head, `${t.coachNickname || t.adminEmail} — ${t.name}`)
    }
    for (const c of t.coaches) {
      const e = c.email.toLowerCase()
      if (!orgCoachMap.has(e)) orgCoachMap.set(e, `${c.nickname || c.email} — ${t.name}`)
    }
  }
  const orgCoaches = [...orgCoachMap.entries()].map(([email, label]) => ({ email, label }))

  async function handleBuy(team: TeamData) {
    const dest = getDestSelect(team.id)
    const qty = getQty(team.id)
    setBuying(true)
    setError(prev => ({ ...prev, [team.id]: '' }))
    try {
      if (dest === 'coach') {
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
        const playerUserIds = dest === 'all' ? team.members.map(m => m.id) : [dest]
        if (playerUserIds.length === 0) {
          setError(prev => ({ ...prev, [team.id]: 'No players have joined this team yet' }))
          setBuying(false)
          return
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

  async function handleBuyClass() {
    if (classPlayerCount < CLASS_MIN_PLAYERS) {
      setClassError(`Minimum ${CLASS_MIN_PLAYERS} players total across the three ball sizes.`)
      return
    }
    setBuyingClass(true)
    setClassError('')
    try {
      const res = await fetch('/api/org/buy-class-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size5: classSize5, size6: classSize6, size7: classSize7 }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setClassError(data.error || 'Checkout failed')
        setBuyingClass(false)
        return
      }
      window.location.href = data.url
    } catch {
      setClassError('Something went wrong. Please try again.')
      setBuyingClass(false)
    }
  }

  const classPricePerPlayer = classPlayerCount >= CLASS_BULK_THRESHOLD ? 36.99 : 40
  const classTotal = classPriceCents(classPlayerCount) / 100

  // Whole purchase pitch hidden in the iOS app (guideline 3.1.1) — showing a
  // priced buy form with a missing button reads as broken UI or steering.
  const classProgramSection = inApp ? null : (
    <div className="space-y-4">
      {/* Collapsed view: slim orange bar; expanded view: full pitch + buy form. */}
      {!classProgramOpen ? (
        <button
          onClick={() => setClassProgramOpen(true)}
          className="w-full flex items-center justify-between gap-4 bg-gradient-to-br from-ember-500 to-ember-600 hover:from-ember-400 hover:to-ember-500 rounded-2xl px-5 py-4 text-white text-left transition-colors"
        >
          <div className="min-w-0">
            <p className="text-ember-100 text-[10px] font-bold uppercase tracking-widest">New</p>
            <p className="font-black text-base truncate">10-Week Shooting Class · $40/player</p>
            <p className="text-ember-100 text-xs mt-0.5">{classPackages.length > 0 ? 'Buy another class package' : 'Tap to expand the buy form'}</p>
          </div>
          <span className="text-2xl font-black shrink-0">+</span>
        </button>
      ) : (
      <div className="bg-gradient-to-br from-ember-500 to-ember-600 rounded-2xl p-6 text-white space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <p className="text-ember-100 text-xs font-bold uppercase tracking-widest">New</p>
            <h2 className="text-2xl font-black">10-Week Shooting Class</h2>
            <p className="text-ember-100 text-sm max-w-sm">
              A structured program that turns your organization into a coaching powerhouse.
              Each player gets a ball, 2 shot analyses, and a personalized completion certificate.
            </p>
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <div className="bg-white/20 rounded-xl px-4 py-3 text-center">
              <p className="text-4xl font-black">$40</p>
              <p className="text-ember-100 text-xs">per player</p>
              <p className="text-ember-200 text-xs mt-1">$36.99/player for 30+</p>
            </div>
            <button
              onClick={() => setClassProgramOpen(false)}
              className="bg-white/20 hover:bg-white/30 rounded-xl w-10 h-10 flex items-center justify-center text-white text-2xl font-black transition-colors"
              aria-label="Minimize"
            >−</button>
          </div>
        </div>

        {/* Perks row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { Icon: BasketballIcon, label: '1 Training Ball', sub: 'per player' },
            { Icon: TargetIcon, label: '2 Shot Analyses', sub: 'start & end' },
            { Icon: TrophyIcon, label: 'Certificate', sub: 'with scores' },
          ].map(p => (
            <div key={p.label} className="bg-white/15 rounded-xl px-3 py-2 text-center">
              <div className="flex justify-center"><p.Icon aria-hidden className="w-5 h-5" /></div>
              <p className="font-bold text-sm leading-tight mt-0.5">{p.label}</p>
              <p className="text-ember-200 text-xs">{p.sub}</p>
            </div>
          ))}
        </div>

        {/* 10-week outline */}
        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold text-ember-100 hover:text-white list-none flex items-center gap-1">
            <span className="group-open:hidden">▶ View 10-week session outline</span>
            <span className="hidden group-open:inline">▼ Hide session outline</span>
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs">
            {[
              'Session 1 — Initial shot analysis',
              'Session 2 — Grip & hand placement',
              'Session 3 — Elbow alignment',
              'Session 4 — Stance & base',
              'Session 5 — Shot pocket',
              'Session 6 — Release mechanics',
              'Session 7 — Shot arc (45–60°)',
              'Session 8 — Guide hand discipline',
              'Session 9 — Full shot flow',
              'Session 10 — Final evaluation + certificate',
            ].map(s => (
              <div key={s} className="bg-white/10 rounded-lg px-2.5 py-1.5 text-ember-50 font-medium">{s}</div>
            ))}
          </div>
        </details>

        {/* Divider */}
        <div className="border-t border-white/20" />

        {/* Buy form — inside the same card */}
        <div className="space-y-3">
          <p className="font-black text-white text-base">Purchase a Class Package</p>
          <p className="text-ember-100 text-xs">Minimum {CLASS_MIN_PLAYERS} players total. Each player gets a training ball, 2 analysis tokens, and a certificate when they complete both evaluations.</p>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-ember-200 uppercase tracking-wide">Players by ball size</label>
            <div className="space-y-2">
              {([
                { key: 'size5' as const, label: 'Size 5', sub: 'Youth · 27.5"', value: classSize5, set: setClassSize5 },
                { key: 'size6' as const, label: 'Size 6', sub: "Women's / Youth · 28.5\"", value: classSize6, set: setClassSize6 },
                { key: 'size7' as const, label: 'Size 7', sub: "Men's · 29.5\"", value: classSize7, set: setClassSize7 },
              ]).map(row => (
                <div key={row.key} className="flex items-center gap-3 bg-white/10 rounded-xl px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm">{row.label}</p>
                    <p className="text-ember-200 text-xs">{row.sub}</p>
                  </div>
                  <button
                    onClick={() => row.set(v => Math.max(0, v - 1))}
                    className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white font-bold transition-colors flex items-center justify-center shrink-0"
                  >−</button>
                  <input
                    type="number"
                    min={0}
                    value={row.value}
                    onChange={e => row.set(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-14 bg-white/20 border border-white/30 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:border-white"
                  />
                  <button
                    onClick={() => row.set(v => v + 1)}
                    className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white font-bold transition-colors flex items-center justify-center shrink-0"
                  >+</button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-ember-200">Total players</span>
              <span className={`font-black text-base ${classPlayerCount < CLASS_MIN_PLAYERS ? 'text-red-200' : 'text-white'}`}>
                {classPlayerCount}
              </span>
            </div>
            {classPlayerCount < CLASS_MIN_PLAYERS && (
              <p className="text-xs text-red-200 font-semibold">Need at least {CLASS_MIN_PLAYERS} players total.</p>
            )}
            {classPlayerCount >= CLASS_BULK_THRESHOLD && (
              <p className="text-xs text-green-300 font-semibold">Bulk rate unlocked — $36.99/player</p>
            )}
          </div>

          <div className="bg-white/15 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm text-ember-100">{classPlayerCount} players × ${classPricePerPlayer}</p>
              <p className="text-xs text-ember-200 mt-0.5">{classPlayerCount * 2} total analyses + {classPlayerCount} certificates</p>
            </div>
            <p className="text-2xl font-black text-white">${classTotal.toLocaleString()}</p>
          </div>

          {classError && <p className="text-red-200 text-sm">{classError}</p>}

          {/* Hidden in the iOS app: digital purchases there must use native in-app purchase. */}
          {!inApp && (
            <button
              onClick={handleBuyClass}
              disabled={buyingClass || classPlayerCount < CLASS_MIN_PLAYERS}
              className="w-full bg-white dark:bg-ink-900 hover:bg-ember-50 dark:hover:bg-ember-500/10 disabled:bg-white/60 disabled:text-ember-400 text-ember-600 dark:text-ember-400 font-black py-3 rounded-xl transition-colors"
            >
              {buyingClass ? 'Redirecting to checkout...' : `Buy Class Package — $${classTotal.toLocaleString()}`}
            </button>
          )}
        </div>
      </div>
      )}

      {/* Each class package is now rendered inline inside its matching team
          panel below (Your Teams), so no standalone "Active Class Programs"
          section is needed. */}
    </div>
  )

  const addTeamSection = (
    <div className="border border-gray-200 dark:border-courtline rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-black text-black dark:text-chalk">Add a Team</h2>
        <button
          onClick={() => {
            setAddOpen(o => !o)
            setAddStatus('idle')
            setAddError('')
          }}
          className="bg-ember-500 hover:bg-ember-400 text-ink-950 font-bold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          {addOpen ? 'Cancel' : 'Add Team'}
        </button>
      </div>

      {addOpen && (
        <form onSubmit={addTeam} className="space-y-3">
          <input
            type="text"
            required
            aria-label="Team name (e.g. Westside Hawks)"
            placeholder="Team name (e.g. Westside Hawks)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-3 text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors"
          />
          <input
            type="text"
            aria-label="Age group (optional) — e.g. U14, Varsity, JV"
            placeholder="Age group (optional) — e.g. U14, Varsity, JV"
            value={newAgeGroup}
            onChange={e => setNewAgeGroup(e.target.value)}
            className="w-full bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-3 text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors"
          />
          <input
            type="email"
            aria-label="Coach email — leave blank to coach it yourself"
            placeholder="Coach email — leave blank to coach it yourself"
            value={newCoachEmail}
            onChange={e => setNewCoachEmail(e.target.value)}
            className="w-full bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-3 text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors"
          />
          <input
            type="text"
            aria-label="Coach name (shown as the coach)"
            placeholder="Coach name (shown as the coach)"
            value={newCoachName}
            onChange={e => setNewCoachName(e.target.value)}
            className="w-full bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-3 text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors"
          />
          <p className="text-xs text-gray-400 dark:text-chalk-dim">
            With an email, the coach is invited to set up their own account. Leave it blank to
            coach the team yourself — open it any time from the team list.
          </p>
          {addError && <p className="text-red-500 text-sm">{addError}</p>}
          {addStatus === 'success' && (
            <p className="text-green-600 dark:text-green-400 text-sm font-medium">
              {addSuccessEmail
                ? `Team added! Invite sent to ${addSuccessEmail}.`
                : 'Team added! Open it from the team list below.'}
            </p>
          )}
          <button
            type="submit"
            disabled={addStatus === 'loading' || addStatus === 'success'}
            className="bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-bold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            {addStatus === 'loading'
              ? 'Adding team...'
              : newCoachEmail.trim() ? 'Add Team & Send Invite' : 'Add Team'}
          </button>
        </form>
      )}
    </div>
  )

  if (teams.length === 0) {
    return (
      <div className="space-y-4">
        {classProgramSection}
        {addTeamSection}
        <div className="text-center py-12 text-gray-400 dark:text-chalk-dim border-2 border-dashed border-gray-200 dark:border-courtline rounded-2xl">
          <p className="font-semibold">No teams in {orgName} yet</p>
          <p className="text-sm mt-1">
            Add a team above to create it and email the coach a setup link.
          </p>
        </div>
      </div>
    )
  }

  const totalPlayerTokens = teams.reduce((s, t) => s + t.members.reduce((ps, m) => ps + m.tokens, 0), 0)
  const totalTeamCredits = teams.reduce((s, t) => s + t.credits, 0)
  const uniquePlayerCount = new Set(teams.flatMap(t => t.members.map(m => m.id))).size

  // Org-wide standings: every team's leaderboard merged, with a Team column.
  // A player on two teams appears once per team — LeaderboardTable keys rows
  // by id + team when showTeam is on, so the duplicate is intentional and
  // labelled rather than silently collapsed.
  const orgLeaderboard: LeaderboardRow[] = teams.flatMap(t =>
    t.leaderboard.map(r => ({ ...r, team_name: t.name })),
  )

  // ── Tab contents ──────────────────────────────────────────────────
  // JSX-only grouping: all state and handlers stay above, in this same
  // component, so nothing loses its state when tabs switch (AccountTabs
  // keeps inactive panels mounted).

  const teamsTab = (
    <div className="space-y-4">
      {addTeamSection}

      <h2 className="text-xl font-black text-black dark:text-chalk">Your Teams</h2>

      <div className="space-y-3">
        {teams.map(team => {
          const isOpen = expanded === team.id
          const dest = getDestSelect(team.id)
          const qty = getQty(team.id)
          const teamError = error[team.id]
          const isBuyOpen = buyOpen[team.id] ?? false

          return (
            <div key={team.id} id={`team-panel-${team.id}`} className="scroll-mt-24 border border-gray-200 dark:border-courtline rounded-2xl overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : team.id)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 bg-gray-50 dark:bg-ink-800 hover:bg-ember-50 dark:hover:bg-ember-500/10 transition-colors text-left"
              >
                <div>
                  <p className="font-bold text-black dark:text-chalk">{team.name}</p>
                  <p className="text-xs text-gray-500 dark:text-chalk-dim mt-0.5">
                    {team.ageGroup ? `${team.ageGroup} · ` : ''}
                    {team.members.length} player{team.members.length !== 1 ? 's' : ''}
                    {team.credits > 0 ? ` · ${team.credits} team credit${team.credits !== 1 ? 's' : ''}` : ''}
                  </p>
                </div>
                <span className="text-gray-400 dark:text-chalk-dim text-sm">{isOpen ? '−' : '+'}</span>
              </button>

              {isOpen && (
                <div className="px-5 py-4 space-y-4">
                  {/* Open this team's coach dashboard */}
                  <button
                    onClick={() => openTeam(team.id)}
                    className="inline-flex items-center gap-1.5 text-sm font-bold text-ember-600 dark:text-ember-400 hover:text-ember-500 transition-colors"
                  >
                    Open team dashboard
                    <ArrowRightIcon aria-hidden className="w-4 h-4" />
                  </button>

                  {/* This team's week at a glance. "Open full schedule" opens
                      the month in a modal rather than navigating away, so the
                      org owner never leaves this page to check a date. The
                      panel 402s and offers the upgrade on its own when the
                      plan doesn't include scheduling — the tier isn't guessed
                      here, because an individually grandfathered team keeps
                      scheduling even under a Basic org. */}
                  <div className="border border-gray-200 dark:border-courtline rounded-2xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Schedule</p>
                    <TeamSchedulePanel
                      teamId={team.id}
                      theme="light"
                      compact
                      onOpenFull={() => setScheduleModal(team.id)}
                      upgradeCta={{ href: '#org-billing', label: 'Change your plan' }}
                    />
                  </div>

                  {/* This team runs a class package. The full manager — roster,
                      progress, session plan, certificates — is the Class Manager
                      tab; this is the signpost to it, not a second copy. */}
                  {(() => {
                    const pkg = team.classPackageId
                      ? classPackages.find(p => p.id === team.classPackageId)
                      : null
                    if (!pkg) return null
                    const finished = pkg.enrollments.filter(en => en.has_final).length
                    return (
                      <button
                        onClick={() => goToTab('class')}
                        className="w-full text-left border border-ember-500/30 bg-ember-500/5 hover:bg-ember-500/10 rounded-2xl px-4 py-3 flex items-center justify-between gap-4 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-black text-black dark:text-chalk">10-Week Shooting Development Program</p>
                          <p className="text-xs text-gray-500 dark:text-chalk-dim mt-0.5">
                            {pkg.enrollments.length}/{pkg.player_count} enrolled &middot; {finished} finished &middot; {team.credits} credit{team.credits !== 1 ? 's' : ''} left
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-bold text-ember-600 dark:text-ember-400">Open Class Manager &rarr;</span>
                      </button>
                    )
                  })()}

                  {/* Age group — editable by the org */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Age group</span>
                    <InlineEdit
                      value={team.ageGroup ?? ''}
                      endpoint="/api/org/update-team"
                      bodyKey="ageGroup"
                      extra={{ teamId: team.id }}
                      placeholder="e.g. U15, Varsity"
                      textClassName="text-sm font-semibold text-black dark:text-chalk"
                      emptyLabel="Not set"
                    />
                  </div>

                  {/* Roster — coach, players, and the player signup link */}
                  <div className="space-y-3">
                    <Section
                      title="Coaches"
                      tipLabel="What can coaches do?"
                      tip="Coaches manage this team from their own coach dashboard: they upload shots for players and can spend the team's credits. Invited coaches show as pending until they finish setting up their account."
                      summary={`${team.coaches.length + 1} coach${team.coaches.length > 0 ? 'es' : ''}`}
                    >
                      <div className="mt-1 border border-gray-100 dark:border-courtline rounded-xl divide-y divide-gray-100">
                        <div className="flex items-center justify-between gap-3 px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-black dark:text-chalk truncate">{team.coachNickname || team.adminEmail}</p>
                            {team.coachNickname && <p className="text-xs text-gray-400 dark:text-chalk-dim truncate">{team.adminEmail}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs bg-ember-100 dark:bg-ember-500/15 text-ember-700 dark:text-ember-400 font-bold px-2 py-0.5 rounded-full">Head coach</span>
                            <button
                              onClick={() => removeHeadCoach(team.id)}
                              disabled={removingCoach === `head-${team.id}`}
                              className="text-xs font-semibold text-gray-400 dark:text-chalk-dim hover:text-red-500 disabled:opacity-50 transition-colors"
                            >
                              {removingCoach === `head-${team.id}` ? '…' : 'Remove'}
                            </button>
                          </div>
                        </div>
                        {team.coaches.map(c => (
                          <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-black dark:text-chalk truncate">{c.nickname || c.email}</p>
                              {c.nickname && <p className="text-xs text-gray-400 dark:text-chalk-dim truncate">{c.email}</p>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.pending ? 'bg-gray-100 dark:bg-ink-800 text-gray-500 dark:text-chalk-dim' : 'bg-green-100 text-green-700 dark:text-green-400'}`}>
                                {c.pending ? 'Invite pending' : 'Coach'}
                              </span>
                              <button
                                onClick={() => removeCoach(c.id, c.pending)}
                                disabled={removingCoach === c.id}
                                className="text-xs font-semibold text-gray-400 dark:text-chalk-dim hover:text-red-500 disabled:opacity-50 transition-colors"
                              >
                                {removingCoach === c.id ? '…' : c.pending ? 'Cancel' : 'Remove'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2">
                        <OrgAddCoach teamId={team.id} />
                      </div>
                    </Section>
                    <Section
                      title="Players"
                      tipLabel="How do players join?"
                      tip="Players join with the signup link or team code below. Tick the boxes next to players to draft an outreach email to just those players."
                      summary={`${team.members.length} player${team.members.length !== 1 ? 's' : ''}`}
                    >
                      {team.members.length > 1 && (
                        <div className="flex items-center justify-end gap-3">
                          <SortMenu
                            value={playerSort[team.id] ?? 'name'}
                            options={PLAYER_SORT_OPTIONS}
                            onChange={v => setPlayerSort(s => ({ ...s, [team.id]: v }))}
                          />
                        </div>
                      )}
                      {team.members.length === 0 ? (
                        <p className="text-sm text-gray-400 dark:text-chalk-dim mt-0.5">No players have joined yet.</p>
                      ) : (
                        <>
                          <div className="mt-1 border border-gray-100 dark:border-courtline rounded-xl divide-y divide-gray-100">
                            {sortedMembers(team).map(m => (
                              <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={!!emailSelected[m.id]}
                                    onChange={() => toggleEmailMember(m.id)}
                                    className="w-4 h-4 accent-ember-500 shrink-0"
                                  />
                                  <Link
                                    href={`/org/dashboard/member/${m.id}`}
                                    className="text-sm font-semibold text-black dark:text-chalk truncate hover:text-ember-600 dark:hover:text-ember-400 hover:underline transition-colors"
                                  >
                                    {memberDisplayName(m)}
                                  </Link>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-gray-400 dark:text-chalk-dim truncate max-w-[9rem]">{m.email}</span>
                                  <button
                                    onClick={() => removePlayer(team.id, m.id)}
                                    disabled={removingPlayer === m.id}
                                    className="text-xs font-semibold text-gray-400 dark:text-chalk-dim hover:text-red-500 disabled:opacity-50 transition-colors"
                                  >
                                    {removingPlayer === m.id ? '…' : 'Remove'}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                          {team.members.some(m => emailSelected[m.id]) && (
                            <button
                              onClick={() => setEmailDraftTeam(team.id)}
                              className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-ember-600 dark:text-ember-400 hover:text-ember-500 transition-colors"
                            >
                              <MailIcon aria-hidden className="w-4 h-4" />
                              Draft outreach email ({team.members.filter(m => emailSelected[m.id]).length} selected)
                            </button>
                          )}
                        </>
                      )}
                    </Section>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-chalk-dim uppercase tracking-wide mb-1 flex items-center gap-1.5">
                        Player signup link
                        <InfoTip label="What is the player signup link?" align="left">
                          Send this to players (or their parents). It opens the
                          signup page with this team&rsquo;s code pre-filled, so
                          they land on the roster automatically.
                        </InfoTip>
                      </p>
                      <div className="flex items-center gap-2 bg-gray-50 dark:bg-ink-800 border border-gray-300 dark:border-courtline rounded-xl p-2.5">
                        <span className="flex-1 text-xs font-mono text-gray-600 dark:text-chalk-dim truncate">
                          {BASE_URL}/signup?teamCode={team.accessCode}
                        </span>
                        <button
                          onClick={() => copyLink(team.id, team.accessCode)}
                          className="shrink-0 text-sm font-semibold text-ember-500 hover:text-ember-400 transition-colors"
                        >
                          {copiedLink[team.id] ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-chalk-dim mt-1">
                        Players open this link, sign up with the code pre-filled, then enter their name to join.
                      </p>
                    </div>
                  </div>

                  {/* Token balances — only on non-class teams. Class teams
                      already show their stats (Players / Enrolled / Completed /
                      Credits left) in the class panel above, so this duplicate
                      block is redundant and the "PLAYERS — N TOKENS TOTAL"
                      line is misleading in a coach-uploads-for-players model. */}
                  {!team.classPackageId && (
                    <TokenBalances
                      players={team.members.map(m => ({ id: m.id, label: memberDisplayName(m), tokens: m.tokens }))}
                      teamCredits={team.credits}
                      tokenPool={team.tokenPool}
                    />
                  )}

                  {/* Assign team credits to players — spends teams.credits on
                      specific players in this team. Same pool the coach uses
                      via Open team dashboard; lets the org act without
                      hopping into the team's coach view. */}
                  {(() => {
                    const isAssignOpen = teamAssignOpen[team.id] ?? false
                    const picks = teamAssignPicks[team.id] || {}
                    const each = Math.max(1, teamAssignEach[team.id] ?? 1)
                    const selectedIds = Object.keys(picks).filter(id => picks[id])
                    const totalNeeded = selectedIds.length * each
                    const msg = teamAssignMsg[team.id]
                    const isAssignBusy = teamAssignBusy === team.id
                    return (
                      <div className="border border-ember-100 rounded-xl overflow-hidden">
                        <button
                          onClick={() => setTeamAssignOpen(prev => ({ ...prev, [team.id]: !isAssignOpen }))}
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-ember-50 dark:bg-ember-500/10 hover:bg-ember-100 dark:hover:bg-ember-500/15 transition-colors text-left"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-black dark:text-chalk">Assign team credits to players</p>
                            <p className="text-xs text-gray-500 dark:text-chalk-dim mt-0.5">
                              Team credits: <span className="font-bold text-ember-600 dark:text-ember-400">{team.credits}</span>
                              {' '}— spend on specific players in this team.
                            </p>
                          </div>
                          <span className="text-gray-400 dark:text-chalk-dim text-sm shrink-0">{isAssignOpen ? '−' : '+'}</span>
                        </button>
                        {isAssignOpen && (
                          <div className="px-4 py-4 space-y-3 bg-white dark:bg-ink-900">
                            {team.members.length === 0 ? (
                              <p className="text-sm text-gray-400 dark:text-chalk-dim">No players have joined this team yet.</p>
                            ) : team.credits === 0 ? (
                              <p className="text-sm text-gray-500 dark:text-chalk-dim">No credits on this team yet — allocate some from your org balance above.</p>
                            ) : (
                              <>
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Tokens per player</label>
                                  <div className="flex items-center gap-2">
                                    {[1, 2, 5].map(q => (
                                      <button
                                        key={q}
                                        onClick={() => setTeamAssignEach(prev => ({ ...prev, [team.id]: q }))}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                                          each === q
                                            ? 'bg-ember-500 text-ink-950'
                                            : 'bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline text-black dark:text-chalk hover:border-ember-400'
                                        }`}
                                      >
                                        {q}
                                      </button>
                                    ))}
                                    <input
                                      type="number"
                                      min={1}
                                      value={each}
                                      onChange={e => {
                                        const n = parseInt(e.target.value)
                                        setTeamAssignEach(prev => ({ ...prev, [team.id]: Number.isNaN(n) ? 1 : Math.max(1, n) }))
                                      }}
                                      className="w-16 border border-gray-300 dark:border-courtline rounded-lg px-2 py-1.5 text-black dark:text-chalk text-sm text-center focus:outline-none focus:border-ember-500"
                                    />
                                  </div>
                                </div>

                                <div className="space-y-1 border border-gray-100 dark:border-courtline rounded-xl divide-y divide-gray-100 max-h-56 overflow-y-auto">
                                  {team.members.map(m => (
                                    <label key={m.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-ink-800">
                                      <input
                                        type="checkbox"
                                        checked={!!picks[m.id]}
                                        onChange={() => setTeamAssignPicks(prev => ({
                                          ...prev,
                                          [team.id]: { ...(prev[team.id] || {}), [m.id]: !(prev[team.id]?.[m.id]) },
                                        }))}
                                        className="w-4 h-4 accent-ember-500"
                                      />
                                      <span className="flex-1 text-sm text-black dark:text-chalk">{memberDisplayName(m)}</span>
                                      <span className="text-xs text-gray-400 dark:text-chalk-dim">{m.tokens} token{m.tokens !== 1 ? 's' : ''}</span>
                                    </label>
                                  ))}
                                </div>

                                <p className="text-xs text-gray-500 dark:text-chalk-dim">
                                  {selectedIds.length} player{selectedIds.length !== 1 ? 's' : ''} selected
                                  {selectedIds.length > 0 && ` · ${totalNeeded} credit${totalNeeded !== 1 ? 's' : ''} total`}
                                  {totalNeeded > team.credits && (
                                    <span className="text-red-500 font-semibold"> · not enough credits</span>
                                  )}
                                </p>

                                {msg && (
                                  <p className={`text-sm font-medium ${msg.startsWith('Assigned') ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                                    {msg}
                                  </p>
                                )}

                                <button
                                  onClick={() => assignTeamCreditsToPlayers(team.id, team.credits)}
                                  disabled={isAssignBusy || selectedIds.length === 0 || totalNeeded > team.credits}
                                  className="bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-bold px-4 py-2 rounded-xl text-sm transition-colors"
                                >
                                  {isAssignBusy ? 'Assigning…' : `Assign ${totalNeeded} credit${totalNeeded !== 1 ? 's' : ''}`}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Team leaderboard */}
                  <Section
                    title="Team leaderboard"
                    summary={team.leaderboard.length === 0
                      ? 'No shots yet'
                      : `${team.leaderboard.length} player${team.leaderboard.length !== 1 ? 's' : ''}`}
                  >
                    <div className="space-y-2 pt-1">
                      {team.leaderboard.length > 0 && (
                        <div className="flex justify-end">
                          <button
                            onClick={() => setTeamLbModal(team.id)}
                            className="shrink-0 text-xs font-bold text-ember-500 hover:text-ember-400 transition-colors"
                          >
                            View full &amp; print
                          </button>
                        </div>
                      )}
                      {team.leaderboard.length === 0 ? (
                        <p className="text-sm text-gray-400 dark:text-chalk-dim">No shots analyzed yet.</p>
                      ) : (
                        <LeaderboardTable entries={team.leaderboard} context="org" theme="auto" />
                      )}
                    </div>
                  </Section>

                  {/* Buy tokens — collapsible. Hidden in the iOS app (guideline 3.1.1). */}
                  {!inApp && (
                  <div className="border border-gray-200 dark:border-courtline rounded-xl overflow-hidden">
                    <button
                      onClick={() => setBuyOpen(prev => ({ ...prev, [team.id]: !isBuyOpen }))}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 dark:bg-ink-800 hover:bg-ember-50 dark:hover:bg-ember-500/10 transition-colors text-left"
                    >
                      <p className="text-sm font-bold text-black dark:text-chalk">Buy Tokens for This Team</p>
                      <span className="text-gray-400 dark:text-chalk-dim text-sm shrink-0">{isBuyOpen ? '−' : '+'}</span>
                    </button>
                    {isBuyOpen && (
                      <div className="px-4 py-4 space-y-3">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Send to</label>
                          <select
                            value={dest}
                            onChange={e => setDestSelect(prev => ({ ...prev, [team.id]: e.target.value }))}
                            className="w-full border border-gray-300 dark:border-courtline rounded-xl px-3 py-2.5 text-sm text-black dark:text-chalk bg-white dark:bg-ink-900 focus:outline-none focus:border-ember-500"
                          >
                            <option value="all">All Players ({team.members.length})</option>
                            {team.members.map(m => (
                              <option key={m.id} value={m.id}>
                                {memberDisplayName(m)} — {m.tokens} token{m.tokens !== 1 ? 's' : ''}
                              </option>
                            ))}
                            <option value="coach">Team Credits — shared coach balance ({team.credits})</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">
                            {dest === 'coach' ? 'Credits' : 'Tokens per player'}
                          </label>
                          <select
                            value={qty}
                            onChange={e => setQuantity(prev => ({ ...prev, [team.id]: Number(e.target.value) }))}
                            className="w-full border border-gray-300 dark:border-courtline rounded-xl px-3 py-2.5 text-sm text-black dark:text-chalk bg-white dark:bg-ink-900 focus:outline-none focus:border-ember-500"
                          >
                            <option value={1}>1</option>
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                          </select>
                        </div>
                        {teamError && <p className="text-red-500 text-sm">{teamError}</p>}
                        {/* Hidden in the iOS app: digital purchases there must use native in-app purchase. */}
                        {!inApp && (
                          <button
                            onClick={() => handleBuy(team)}
                            disabled={buying}
                            className="w-full bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-bold py-2.5 rounded-xl text-sm transition-colors"
                          >
                            {buying ? 'Redirecting...' : 'Buy Tokens'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  )}

                  {/* Team chat — org has coach powers over its teams' chats */}
                  <div className="border-t border-gray-100 dark:border-courtline pt-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-chalk-dim uppercase tracking-wide mb-2">
                      <MessageSquareIcon aria-hidden className="w-3.5 h-3.5" />
                      Team Chat
                    </p>
                    <TeamChatPanel teamId={team.id} />
                  </div>

                  {/* Email blast to this team's registered players */}
                  <div className="border-t border-gray-100 dark:border-courtline pt-4">
                    <EmailTeamPanel teamId={team.id} playerCount={team.members.length} />
                  </div>

                  {/* Danger zone — delete this team */}
                  <Section title="Danger zone" summary="Delete team">
                    <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-xs text-gray-400 dark:text-chalk-dim max-w-sm">
                        Permanently delete this team, its roster, and its coaches.
                        Players keep their own shot history. This can&apos;t be undone.
                      </p>
                      <button
                        onClick={() => deleteTeam(team)}
                        disabled={deletingTeam === team.id}
                        className="shrink-0 bg-white dark:bg-ink-900 border border-red-300 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 font-bold px-3 py-1.5 rounded-xl text-sm transition-colors"
                      >
                        {deletingTeam === team.id ? 'Deleting…' : 'Delete team'}
                      </button>
                    </div>
                  </Section>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  // Once a package exists this tab stops being a sales pitch and becomes the
  // place the program is actually run from. The buy form moves below it, as
  // the target of "start another package".
  const billingTab = (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black text-black dark:text-chalk">Billing</h2>
        <p className="text-sm text-gray-500 dark:text-chalk-dim mt-1">
          Every purchase on this organization — tokens, team credits, program
          packages and shop orders. Receipts are emailed at checkout.
        </p>
      </div>
      <BillingHistory endpoint="/api/org/billing" />
    </div>
  )

  // One team's whole schedule, front and centre. The Teams tab keeps the
  // week-at-a-glance inside each team's panel; this tab exists so a coach
  // running several teams can reach a schedule without expanding anything.
  // Not compact, so the panel brings its own Week/Month switch, event CRUD
  // and the subscribe links — no modal needed here, the tab IS the full view.
  const scheduleTeamId = scheduleTeam && teams.some(t => t.id === scheduleTeam) ? scheduleTeam : teams[0]?.id
  const scheduleTab = (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black text-black dark:text-chalk">Schedule</h2>
        <p className="text-sm text-gray-500 dark:text-chalk-dim mt-1">
          Practices and games for your teams. Switch between the week and the
          month, and subscribe the schedule to Apple Calendar or Google so it
          keeps itself up to date.
        </p>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-chalk-dim border-2 border-dashed border-gray-200 dark:border-courtline rounded-2xl">
          <p className="font-bold">No teams yet</p>
          <p className="text-sm mt-1">Create a team first and its schedule appears here.</p>
        </div>
      ) : (
        <>
          {/* One team needs no picker — the heading already names it. */}
          {teams.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <label htmlFor="schedule-team" className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-chalk-dim">
                Team
              </label>
              <select
                id="schedule-team"
                value={scheduleTeamId ?? ''}
                onChange={e => setScheduleTeam(e.target.value)}
                className="rounded-xl border border-gray-300 dark:border-courtline bg-white dark:bg-ink-900 text-black dark:text-chalk text-sm font-semibold px-3 py-2"
              >
                {teams.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {scheduleTeamId && (
            <div className="border border-gray-200 dark:border-courtline rounded-2xl p-4">
              {/* Keyed by team so switching teams remounts rather than showing
                  the previous team's events while the new ones load. */}
              <TeamSchedulePanel
                key={scheduleTeamId}
                teamId={scheduleTeamId}
                theme="auto"
                upgradeCta={{ href: '#org-billing', label: 'Change your plan' }}
              />
            </div>
          )}
        </>
      )}
    </div>
  )

  const leaderboardTab = (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black text-black dark:text-chalk">Organization Leaderboard</h2>
        <p className="text-sm text-gray-500 dark:text-chalk-dim mt-1">
          Every player across your teams, ranked by their best analyzed score.
          Each team&apos;s own board is inside its panel in the Teams tab.
        </p>
      </div>
      {orgLeaderboard.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-chalk-dim border-2 border-dashed border-gray-200 dark:border-courtline rounded-2xl">
          <p className="font-bold">No shots analyzed yet</p>
          <p className="text-sm mt-1">Once players upload shots (or coaches upload for them), rankings appear here.</p>
        </div>
      ) : (
        <LeaderboardTable entries={orgLeaderboard} context="org" showTeam theme="auto" />
      )}
    </div>
  )

  const hasClass = classPackages.length > 0

  const classTab = (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-black text-black dark:text-chalk">
            {hasClass ? 'Class Manager' : '10-Week Shooting Development Program'}
          </h2>
          <InfoTip label="What does the 10-week program include?" align="left">
            $40 per player ($36.99 each for 30+). Every player gets a training
            ball, 2 AI shot analyses (start and end of the program), and a
            personalized completion certificate. Buying a package also creates a
            class team and unlocks the discounted org token rate ($2.49 each, or
            $1.49 each when you buy 5+) for your organization.
          </InfoTip>
        </div>
        <p className="text-sm text-gray-500 dark:text-chalk-dim mt-1">
          {hasClass
            ? 'Run the program from here — the week-by-week session plan, roster progress, standings and certificates.'
            : 'A structured ten-week program that turns your organization into a coaching powerhouse.'}
        </p>
      </div>

      {hasClass && (
        <ClassManager
          packages={classPackages.map(pkg => {
            const team = teams.find(t => t.classPackageId === pkg.id)
            return { ...pkg, teamName: team?.name ?? null, teamCredits: team?.credits ?? null }
          })}
          canManage
          onStartAnother={inApp ? undefined : () => setClassProgramOpen(true)}
        />
      )}

      {(!hasClass || classProgramOpen) && classProgramSection}
    </div>
  )

  const settingsTab = (
    <div className="space-y-4">
      <AppearanceSection />
    </div>
  )

  const tokensTab = (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-black text-black dark:text-chalk">Tokens &amp; Credits</h2>
        <InfoTip label="What is the difference between tokens and credits?" align="left">
          <strong>Player tokens</strong> live on a player&rsquo;s own account —
          1 token = 1 shot analysis. <strong>Team credits</strong> are a shared
          pool on a team that you or its coach can spend or assign to that
          team&rsquo;s players. Your <strong>org balance</strong> holds tokens
          you&rsquo;ve bought but not yet handed out.
        </InfoTip>
      </div>
      <OrgTokenPanel
        balance={orgTokenBalance}
        players={orgPlayers}
        coaches={orgCoaches}
        teams={teams.map(t => ({ id: t.id, name: t.name, coachName: t.coachNickname || t.adminEmail, ageGroup: t.ageGroup, memberCount: t.members.length, credits: t.credits }))}
        totalPlayerTokens={totalPlayerTokens}
        totalTeamCredits={totalTeamCredits}
        tier={orgTier}
      />
    </div>
  )

  const uploadsTab = (
    <div className="space-y-4">
      {/* My Uploads — the org owner's own analyzed shots, collapsible */}
      <div className="border border-gray-200 dark:border-courtline rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowMyUploads(o => !o)}
          className="w-full flex items-center justify-between gap-4 px-5 py-4 bg-gray-50 dark:bg-ink-800 hover:bg-ember-50 dark:hover:bg-ember-500/10 transition-colors text-left"
        >
          <div>
            <p className="font-bold text-black dark:text-chalk">My Uploads</p>
            <p className="text-xs text-gray-500 dark:text-chalk-dim mt-0.5">
              {myUploads.length} of your own analyzed shot{myUploads.length !== 1 ? 's' : ''}
            </p>
          </div>
          <span className="text-gray-400 dark:text-chalk-dim text-lg">{showMyUploads ? '−' : '+'}</span>
        </button>
        {showMyUploads && (
          <div className="p-4 space-y-3">
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
        )}
      </div>
    </div>
  )

  const playersTab = (
    <div className="space-y-4">
      {/* All players across the organization — collapsible */}
      <div className="border border-gray-200 dark:border-courtline rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowAllPlayers(o => !o)}
          className="w-full flex items-center justify-between gap-4 px-5 py-4 bg-gray-50 dark:bg-ink-800 hover:bg-ember-50 dark:hover:bg-ember-500/10 transition-colors text-left"
        >
          <div>
            <p className="font-bold text-black dark:text-chalk">All Players</p>
            <p className="text-xs text-gray-500 dark:text-chalk-dim mt-0.5">
              Every player across the organization, with their best score and team
            </p>
          </div>
          <span className="text-gray-400 dark:text-chalk-dim text-lg">{showAllPlayers ? '−' : '+'}</span>
        </button>
        {showAllPlayers && (
          <div className="p-4 space-y-3">
            {(() => {
              // Group by member.id so a player on multiple teams is one row
              // with their teams joined in the Team column. Best score is the
              // max across all teams they're on.
              const byMember = new Map<string, {
                member: typeof teams[number]['members'][number]
                teams: Array<{ teamId: string; teamName: string }>
                score: number | null
              }>()
              for (const t of teams) {
                for (const m of t.members) {
                  const lb = t.leaderboard.find(r => r.kind === 'member' && r.id === m.id)
                  const teamScore = lb ? Number(lb.best_score) : null
                  const existing = byMember.get(m.id)
                  if (existing) {
                    existing.teams.push({ teamId: t.id, teamName: t.name })
                    if (teamScore !== null && (existing.score === null || teamScore > existing.score)) {
                      existing.score = teamScore
                    }
                  } else {
                    byMember.set(m.id, {
                      member: m,
                      teams: [{ teamId: t.id, teamName: t.name }],
                      score: teamScore,
                    })
                  }
                }
              }
              const rows = Array.from(byMember.values())
              if (rows.length === 0) {
                return (
                  <p className="text-sm text-gray-400 dark:text-chalk-dim">
                    No players have joined a team in your organization yet.
                  </p>
                )
              }
              rows.sort((a, b) => {
                if (allPlayersSort === 'name') {
                  return memberDisplayName(a.member).localeCompare(memberDisplayName(b.member))
                }
                if (a.score === null && b.score === null) {
                  return memberDisplayName(a.member).localeCompare(memberDisplayName(b.member))
                }
                if (a.score === null) return 1
                if (b.score === null) return -1
                return allPlayersSort === 'score-desc' ? b.score - a.score : a.score - b.score
              })
              const selectedCount = rows.filter(r => emailSelected[r.member.id]).length
              return (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-400 dark:text-chalk-dim">
                      {rows.length} player{rows.length !== 1 ? 's' : ''}
                    </p>
                    <SortMenu
                      value={allPlayersSort}
                      options={PLAYER_SORT_OPTIONS}
                      onChange={setAllPlayersSort}
                    />
                  </div>
                  <div className="border border-gray-200 dark:border-courtline rounded-2xl overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-ink-800 border-b border-gray-200 dark:border-courtline">
                        <tr>
                          <th className="px-3 py-3 w-8"></th>
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Player</th>
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Teams</th>
                          <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Best Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rows.map(({ member: m, teams: memberTeams, score }) => (
                          <tr key={m.id} className="bg-white dark:bg-ink-900">
                            <td className="px-3 py-2.5">
                              <input
                                type="checkbox"
                                checked={!!emailSelected[m.id]}
                                onChange={() => toggleEmailMember(m.id)}
                                className="w-4 h-4 accent-ember-500"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <Link
                                href={`/org/dashboard/member/${m.id}`}
                                className="text-sm font-semibold text-black dark:text-chalk hover:text-ember-600 dark:hover:text-ember-400 hover:underline transition-colors"
                              >
                                {memberDisplayName(m)}
                              </Link>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="text-sm text-gray-700 dark:text-chalk-dim">
                                {memberTeams.map((tm, i) => (
                                  <span key={tm.teamId}>
                                    <button
                                      onClick={() => goToTeam(tm.teamId)}
                                      className="text-ember-600 dark:text-ember-400 hover:text-ember-500 hover:underline transition-colors"
                                    >
                                      {tm.teamName}
                                    </button>
                                    {i < memberTeams.length - 1 && <span>, </span>}
                                  </span>
                                ))}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {score === null ? (
                                <span className="text-xs text-gray-400 dark:text-chalk-dim">No shots</span>
                              ) : (
                                <span
                                  className={`font-black text-base ${
                                    score >= 8
                                      ? 'text-green-600 dark:text-green-400'
                                      : score >= 6
                                        ? 'text-ember-500'
                                        : 'text-red-500'
                                  }`}
                                >
                                  {score.toFixed(1)}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {selectedCount > 0 && (
                    <button
                      onClick={() => setEmailDraftTeam('__all__')}
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-ember-600 dark:text-ember-400 hover:text-ember-500 transition-colors"
                    >
                      <MailIcon aria-hidden className="w-4 h-4" />
                      Draft outreach email ({selectedCount} selected)
                    </button>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* ── Org token balance — always visible above the tabs ─────────── */}
      <section className="bg-ember-50 dark:bg-ember-500/10 border border-ember-200 rounded-2xl p-5 space-y-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Org Token Balance</h2>
            <InfoTip label="How do org tokens work?" align="left">
              Tokens you buy land in this org balance first. Use Quick send
              below to move them to a coach or team, or open the Tokens tab to
              assign them straight to players or spend them on your own
              uploads. 1 token = 1 AI shot analysis.
            </InfoTip>
          </div>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-black dark:text-chalk">{orgTokenBalance}</span>
              <span className="text-gray-500 dark:text-chalk-dim text-sm">token{orgTokenBalance !== 1 ? 's' : ''} unassigned</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-chalk-dim">
              <span>
                <span className="font-black text-black dark:text-chalk">{totalPlayerTokens}</span> player token{totalPlayerTokens !== 1 ? 's' : ''}
              </span>
              <span>
                <span className="font-black text-black dark:text-chalk">{totalTeamCredits}</span> team credit{totalTeamCredits !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Quick send — move balance tokens to a coach or team without
            leaving the banner. */}
        <div className="border-t border-ember-200 pt-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-bold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Quick send</p>
            <InfoTip label="Where do quick-sent credits go?" align="left">
              Sending to a <strong>coach</strong> funds their personal
              credits — only they can spend those, on their own uploads or on
              players. Sending to a <strong>team</strong> funds its shared
              team credits, which you and that team&apos;s coach can both
              spend on the team.
            </InfoTip>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={quickSendTo}
              onChange={e => { setQuickSendTo(e.target.value); setQuickSendMsg('') }}
              className="flex-1 min-w-[12rem] border border-ember-200 rounded-xl px-3 py-2.5 text-sm text-black dark:text-chalk bg-white dark:bg-ink-900 focus:outline-none focus:border-ember-500"
            >
              <option value="">Choose a coach or team…</option>
              <optgroup label="Coaches — personal credits">
                {orgCoaches.map(c => (
                  <option key={c.email} value={`coach:${c.email}`}>{c.label}</option>
                ))}
              </optgroup>
              <optgroup label="Teams — shared team credits">
                {teams.map(t => (
                  <option key={t.id} value={`team:${t.id}`}>
                    {t.name}{t.ageGroup ? ' · ' + t.ageGroup : ''} ({t.credits} credit{t.credits !== 1 ? 's' : ''})
                  </option>
                ))}
              </optgroup>
            </select>
            <input
              type="number"
              min={1}
              value={quickSendQty || ''}
              onChange={e => {
                const n = parseInt(e.target.value)
                setQuickSendQty(Number.isNaN(n) ? 0 : Math.min(10000, Math.max(0, n)))
              }}
              onBlur={() => { if (quickSendQty < 1) setQuickSendQty(1) }}
              aria-label="Tokens to send"
              className="w-20 border border-ember-200 rounded-xl px-2 py-2 text-center text-black dark:text-chalk text-sm bg-white dark:bg-ink-900 focus:outline-none focus:border-ember-500"
            />
            <button
              type="button"
              onClick={quickSend}
              disabled={quickSendBusy || !quickSendTo || quickSendQty < 1 || quickSendQty > orgTokenBalance}
              className="bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-bold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              {quickSendBusy ? 'Sending…' : 'Send'}
            </button>
          </div>
          {quickSendQty > orgTokenBalance && (
            <p className="text-xs font-semibold text-red-500">
              Not enough tokens — you have {orgTokenBalance}.
            </p>
          )}
          {quickSendMsg && (
            <p className={`text-sm font-semibold ${quickSendMsg.startsWith('Sent') ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
              {quickSendMsg}
            </p>
          )}
        </div>
      </section>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <AccountTabs
        tabs={[
          { id: 'teams', label: 'Teams', count: teams.length, content: teamsTab },
          { id: 'schedule', label: 'Schedule', content: scheduleTab },
          // The class purchase pitch is hidden in the iOS app (guideline 3.1.1).
          // The purchase pitch is hidden in the iOS app (guideline 3.1.1), but an
          // org that already runs a program still gets its manager there.
          ...(inApp && !hasClass
            ? []
            : [{ id: 'class', label: hasClass ? 'Class Manager' : 'Shooting Class', content: classTab }]),
          { id: 'tokens', label: 'Tokens', content: tokensTab },
          { id: 'leaderboard', label: 'Leaderboard', count: orgLeaderboard.length, content: leaderboardTab },
          { id: 'players', label: 'Players', count: uniquePlayerCount, content: playersTab },
          { id: 'billing', label: 'Billing', content: billingTab },
          { id: 'uploads', label: 'My Uploads', count: myUploads.length, content: uploadsTab },
          { id: 'settings', label: 'Settings', content: settingsTab },
        ]}
        defaultTab="teams"
      />

      {/* Modals stay at the component root — outside the tab panels — so
          they open from any tab, and the leaderboard one keeps working with
          window.print() (globals.css targets .leaderboard-modal on <body>). */}

      {/* Email draft modal */}
      {emailDraftTeam && (() => {
        // '__all__' = members selected across the org-wide All Players list;
        // otherwise just the one team's members.
        const pool = emailDraftTeam === '__all__'
          ? teams.flatMap(tm => tm.members)
          : (teams.find(tm => tm.id === emailDraftTeam)?.members ?? [])
        const selected = pool.filter(m => emailSelected[m.id])
        if (selected.length === 0) return null
        const emailList = selected.map(m => m.email).join(', ')
        const names = selected.map(m => memberDisplayName(m))
        const body = `Subject: Your Shooting Evaluation Results

Hi [Player Name],

We recently conducted a shooting form evaluation, and based on your results we think you would benefit from some additional work on your shooting mechanics.

Your evaluation highlighted areas that, with focused coaching, can make a significant difference to your game.

We are offering a shooting class specifically designed to address these areas. If you are interested in taking your game to the next level, we encourage you to sign up.

[ADD CLASS NAME, DATES, LOCATION, PRICE, AND SIGNUP DETAILS HERE]

Please reach out if you have any questions. We look forward to helping you improve.

[YOUR NAME]
[YOUR ORGANIZATION]`

        return createPortal(
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setEmailDraftTeam(null)}
          >
            <div
              className="bg-white dark:bg-ink-900 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-auto p-6 space-y-5"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-black text-black dark:text-chalk">Outreach Email Draft</h2>
                <button onClick={() => setEmailDraftTeam(null)} className="text-gray-400 dark:text-chalk-dim hover:text-black dark:hover:text-chalk text-2xl leading-none">×</button>
              </div>

              {/* Emails block */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">
                    Recipient emails ({selected.length})
                  </p>
                  <button
                    onClick={() => copyText(emailList, 'emails')}
                    className="text-xs font-bold text-ember-500 hover:text-ember-400 transition-colors"
                  >
                    {emailCopied === 'emails' ? 'Copied!' : 'Copy all emails'}
                  </button>
                </div>
                <div className="bg-gray-50 dark:bg-ink-800 border border-gray-200 dark:border-courtline rounded-xl px-4 py-3 text-sm text-gray-700 dark:text-chalk-dim break-all leading-relaxed">
                  {emailList}
                </div>
                <p className="text-xs text-gray-400 dark:text-chalk-dim">Paste these into the To or BCC field of your email client.</p>
              </div>

              {/* Body block */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">Email body</p>
                  <button
                    onClick={() => copyText(body, 'body')}
                    className="text-xs font-bold text-ember-500 hover:text-ember-400 transition-colors"
                  >
                    {emailCopied === 'body' ? 'Copied!' : 'Copy body'}
                  </button>
                </div>
                <pre className="bg-gray-50 dark:bg-ink-800 border border-gray-200 dark:border-courtline rounded-xl px-4 py-3 text-sm text-gray-700 dark:text-chalk-dim whitespace-pre-wrap leading-relaxed font-sans">
                  {body}
                </pre>
                <p className="text-xs text-gray-400 dark:text-chalk-dim">Fill in the bracketed sections with your own class details before sending.</p>
              </div>

              <p className="text-xs text-gray-400 dark:text-chalk-dim border-t border-gray-100 dark:border-courtline pt-4">
                Selected: {names.join(', ')}
              </p>
            </div>
          </div>,
          document.body,
        )
      })()}

      {/* Team leaderboard popup with print — portaled to <body> for a clean printout */}
      {/* The full schedule: the month, in place. Wider than the leaderboard
          modal because a month grid is seven columns, and not compact, so the
          org owner can create and edit events here rather than hopping to the
          coach dashboard. */}
      {scheduleModal && (() => {
        const t = teams.find(tm => tm.id === scheduleModal)
        if (!t) return null
        return createPortal(
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setScheduleModal(null)}
          >
            <div
              className="bg-white dark:bg-ink-900 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-auto p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-black text-black dark:text-chalk">{t.name} Schedule</h2>
                <button
                  onClick={() => setScheduleModal(null)}
                  className="shrink-0 text-sm font-semibold text-gray-400 dark:text-chalk-dim hover:text-red-500 transition-colors"
                >
                  Close
                </button>
              </div>
              <TeamSchedulePanel
                teamId={t.id}
                theme="light"
                initialView="month"
                upgradeCta={{ href: '#org-billing', label: 'Change your plan' }}
              />
            </div>
          </div>,
          document.body,
        )
      })()}

      {teamLbModal && (() => {
        const t = teams.find(tm => tm.id === teamLbModal)
        if (!t) return null
        return createPortal(
          <div
            className="leaderboard-modal-backdrop fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setTeamLbModal(null)}
          >
            <div
              className="leaderboard-modal bg-white dark:bg-ink-900 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-auto p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-black text-black dark:text-chalk">{t.name} Leaderboard</h2>
                <div className="flex items-center gap-2 print:hidden">
                  <PrintButton label="Print" />
                  <button
                    onClick={() => setTeamLbModal(null)}
                    className="shrink-0 text-sm font-semibold text-gray-400 dark:text-chalk-dim hover:text-red-500 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
              <LeaderboardTable entries={t.leaderboard} context="org" theme="auto" />
            </div>
          </div>,
          document.body,
        )
      })()}
    </div>
  )
}
