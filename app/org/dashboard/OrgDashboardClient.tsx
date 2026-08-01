'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useIsInApp } from '@/lib/useIsInApp'
import Link from 'next/link'
import OrgAddCoach from './OrgAddCoach'
import AccountTabs from '@/components/account/AccountTabs'
import Section from '@/components/account/Section'
import InfoTip from '@/components/InfoTip'
import TokenBalances from '@/components/TokenBalances'
import InlineEdit from '@/components/InlineEdit'
import LeaderboardTable, { type LeaderboardRow } from '@/components/LeaderboardTable'
import SortMenu, { type SortOption } from '@/components/SortMenu'
import OrgTokenPanel from '@/components/OrgTokenPanel'
import PlayerShotList, { type Shot } from '@/components/PlayerShotList'
import PrintButton from '@/components/PrintButton'
import { CLASS_MIN_PLAYERS, CLASS_BULK_THRESHOLD, classPriceCents } from '@/lib/org-class-pricing'
import { copyToClipboard } from '@/lib/copy'

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
  initiated: boolean
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
}


type PlayerSortMode = 'name' | 'score-desc' | 'score-asc'

const PLAYER_SORT_OPTIONS: SortOption<PlayerSortMode>[] = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'score-desc', label: 'Highest score' },
  { value: 'score-asc', label: 'Lowest score' },
]

export default function OrgDashboardClient({ teams, orgName, classPackages, myUploads, orgTokenBalance }: Props) {
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
  const [showMyUploads, setShowMyUploads] = useState(true)
  const [showAllPlayers, setShowAllPlayers] = useState(true)
  const [playerSort, setPlayerSort] = useState<Record<string, PlayerSortMode>>({})
  const [allPlayersSort, setAllPlayersSort] = useState<PlayerSortMode>('name')
  const [teamLbModal, setTeamLbModal] = useState<string | null>(null)
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
  // Collapsed by default once the org has at least one package — they've seen the pitch.
  const [classProgramOpen, setClassProgramOpen] = useState(classPackages.length === 0)
  const [buyingClass, setBuyingClass] = useState(false)
  const [classError, setClassError] = useState('')
  const [enrollOpen, setEnrollOpen] = useState<string | null>(null)
  const [enrollFirstName, setEnrollFirstName] = useState('')
  const [enrollLastInit, setEnrollLastInit] = useState('')
  const [enrollUserId, setEnrollUserId] = useState('')
  const [enrolling, setEnrolling] = useState(false)
  const [enrollError, setEnrollError] = useState('')
  const [enrollSuccess, setEnrollSuccess] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState<string | null>(null)
  const [leaderboard, setLeaderboard] = useState<ClassEnrollment[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)

  const [resettingEnrollment, setResettingEnrollment] = useState<string | null>(null)

  // Per-team "assign team credits to players" form state.
  const [teamAssignOpen, setTeamAssignOpen] = useState<Record<string, boolean>>({})
  const [teamAssignPicks, setTeamAssignPicks] = useState<Record<string, Record<string, boolean>>>({})
  const [teamAssignEach, setTeamAssignEach] = useState<Record<string, number>>({})
  const [teamAssignBusy, setTeamAssignBusy] = useState<string | null>(null)
  const [teamAssignMsg, setTeamAssignMsg] = useState<Record<string, string>>({})

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

  async function resetEnrollment(enrollmentId: string, playerName: string) {
    if (!confirm(`Clear all class progress for ${playerName}? Their next upload will count as their FIRST again.`)) return
    setResettingEnrollment(enrollmentId)
    try {
      const res = await fetch('/api/org/reset-enrollment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Could not reset enrollment.')
        setResettingEnrollment(null)
        return
      }
      router.refresh()
    } catch {
      alert('Something went wrong.')
    }
    setResettingEnrollment(null)
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

  async function handleEnroll(packageId: string) {
    if (!enrollFirstName.trim()) { setEnrollError('First name required'); return }
    setEnrolling(true)
    setEnrollError('')
    try {
      const res = await fetch('/api/org/class/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId,
          userId: enrollUserId.trim() || undefined,
          firstName: enrollFirstName.trim(),
          lastNameInitial: enrollLastInit.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setEnrollError(data.error || 'Enrollment failed')
        setEnrolling(false)
        return
      }
      setEnrollSuccess(true)
      setEnrollFirstName('')
      setEnrollLastInit('')
      setEnrollUserId('')
      setTimeout(() => { setEnrollSuccess(false); setEnrollOpen(null); router.refresh() }, 2000)
    } catch {
      setEnrollError('Something went wrong.')
    }
    setEnrolling(false)
  }

  async function loadLeaderboard(packageId: string) {
    setLeaderboardLoading(true)
    try {
      const res = await fetch(`/api/org/class/leaderboard?packageId=${packageId}`)
      const data = await res.json()
      setLeaderboard(data.leaderboard || [])
    } catch { setLeaderboard([]) }
    setLeaderboardLoading(false)
  }

  function toggleLeaderboard(packageId: string) {
    if (showLeaderboard === packageId) {
      setShowLeaderboard(null)
    } else {
      setShowLeaderboard(packageId)
      loadLeaderboard(packageId)
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
          className="w-full flex items-center justify-between gap-4 bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 rounded-2xl px-5 py-4 text-white text-left transition-colors"
        >
          <div className="min-w-0">
            <p className="text-orange-100 text-[10px] font-bold uppercase tracking-widest">New</p>
            <p className="font-black text-base truncate">10-Week Shooting Class · $40/player</p>
            <p className="text-orange-100 text-xs mt-0.5">{classPackages.length > 0 ? 'Buy another class package' : 'Tap to expand the buy form'}</p>
          </div>
          <span className="text-2xl font-black shrink-0">+</span>
        </button>
      ) : (
      <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <p className="text-orange-100 text-xs font-bold uppercase tracking-widest">New</p>
            <h2 className="text-2xl font-black">10-Week Shooting Class</h2>
            <p className="text-orange-100 text-sm max-w-sm">
              A structured program that turns your organization into a coaching powerhouse.
              Each player gets a ball, 2 shot analyses, and a personalized completion certificate.
            </p>
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <div className="bg-white/20 rounded-xl px-4 py-3 text-center">
              <p className="text-4xl font-black">$40</p>
              <p className="text-orange-100 text-xs">per player</p>
              <p className="text-orange-200 text-xs mt-1">$36.99/player for 30+</p>
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
            { icon: '🏀', label: '1 Training Ball', sub: 'per player' },
            { icon: '🎯', label: '2 Shot Analyses', sub: 'start & end' },
            { icon: '🏆', label: 'Certificate', sub: 'with scores' },
          ].map(p => (
            <div key={p.label} className="bg-white/15 rounded-xl px-3 py-2 text-center">
              <p className="text-xl">{p.icon}</p>
              <p className="font-bold text-sm leading-tight mt-0.5">{p.label}</p>
              <p className="text-orange-200 text-xs">{p.sub}</p>
            </div>
          ))}
        </div>

        {/* 10-week outline */}
        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold text-orange-100 hover:text-white list-none flex items-center gap-1">
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
              <div key={s} className="bg-white/10 rounded-lg px-2.5 py-1.5 text-orange-50 font-medium">{s}</div>
            ))}
          </div>
        </details>

        {/* Divider */}
        <div className="border-t border-white/20" />

        {/* Buy form — inside the same card */}
        <div className="space-y-3">
          <p className="font-black text-white text-base">Purchase a Class Package</p>
          <p className="text-orange-100 text-xs">Minimum {CLASS_MIN_PLAYERS} players total. Each player gets a training ball, 2 analysis tokens, and a certificate when they complete both evaluations.</p>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-orange-200 uppercase tracking-wide">Players by ball size</label>
            <div className="space-y-2">
              {([
                { key: 'size5' as const, label: 'Size 5', sub: 'Youth · 27.5"', value: classSize5, set: setClassSize5 },
                { key: 'size6' as const, label: 'Size 6', sub: "Women's / Youth · 28.5\"", value: classSize6, set: setClassSize6 },
                { key: 'size7' as const, label: 'Size 7', sub: "Men's · 29.5\"", value: classSize7, set: setClassSize7 },
              ]).map(row => (
                <div key={row.key} className="flex items-center gap-3 bg-white/10 rounded-xl px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm">{row.label}</p>
                    <p className="text-orange-200 text-xs">{row.sub}</p>
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
              <span className="text-orange-200">Total players</span>
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
              <p className="text-sm text-orange-100">{classPlayerCount} players × ${classPricePerPlayer}</p>
              <p className="text-xs text-orange-200 mt-0.5">{classPlayerCount * 2} total analyses + {classPlayerCount} certificates</p>
            </div>
            <p className="text-2xl font-black text-white">${classTotal.toLocaleString()}</p>
          </div>

          {classError && <p className="text-red-200 text-sm">{classError}</p>}

          {/* Hidden in the iOS app: digital purchases there must use native in-app purchase. */}
          {!inApp && (
            <button
              onClick={handleBuyClass}
              disabled={buyingClass || classPlayerCount < CLASS_MIN_PLAYERS}
              className="w-full bg-white hover:bg-orange-50 disabled:bg-white/60 disabled:text-orange-400 text-orange-600 font-black py-3 rounded-xl transition-colors"
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
            placeholder="Coach email — leave blank to coach it yourself"
            value={newCoachEmail}
            onChange={e => setNewCoachEmail(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
          />
          <input
            type="text"
            placeholder="Coach name (shown as the coach)"
            value={newCoachName}
            onChange={e => setNewCoachName(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
          />
          <p className="text-xs text-gray-400">
            With an email, the coach is invited to set up their own account. Leave it blank to
            coach the team yourself — open it any time from the team list.
          </p>
          {addError && <p className="text-red-500 text-sm">{addError}</p>}
          {addStatus === 'success' && (
            <p className="text-green-600 text-sm font-medium">
              {addSuccessEmail
                ? `Team added! Invite sent to ${addSuccessEmail}.`
                : 'Team added! Open it from the team list below.'}
            </p>
          )}
          <button
            type="submit"
            disabled={addStatus === 'loading' || addStatus === 'success'}
            className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
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
        <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
          <p className="font-semibold">No teams in {orgName} yet</p>
          <p className="text-sm mt-1">
            Add a team above to create it and email the coach a setup link.
          </p>
        </div>
      </div>
    )
  }

  const totalPlayerTokens = teams.reduce((s, t) => s + t.members.reduce((ps, m) => ps + m.tokens, 0), 0)
  const totalCoachCredits = teams.reduce((s, t) => s + t.credits, 0)
  const uniquePlayerCount = new Set(teams.flatMap(t => t.members.map(m => m.id))).size

  // ── Tab contents ──────────────────────────────────────────────────
  // JSX-only grouping: all state and handlers stay above, in this same
  // component, so nothing loses its state when tabs switch (AccountTabs
  // keeps inactive panels mounted).

  const teamsTab = (
    <div className="space-y-4">
      {addTeamSection}

      <h2 className="text-xl font-black text-black">Your Teams</h2>

      <div className="space-y-3">
        {teams.map(team => {
          const isOpen = expanded === team.id
          const dest = getDestSelect(team.id)
          const qty = getQty(team.id)
          const teamError = error[team.id]
          const isBuyOpen = buyOpen[team.id] ?? false

          return (
            <div key={team.id} id={`team-panel-${team.id}`} className="scroll-mt-24 border border-gray-200 rounded-2xl overflow-hidden">
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
                  {/* Open this team's coach dashboard */}
                  <button
                    onClick={() => openTeam(team.id)}
                    className="text-sm font-bold text-orange-500 hover:text-orange-400 transition-colors"
                  >
                    Open team dashboard →
                  </button>

                  {/* Class-package details — only when this team is the auto-created
                      team for a class purchase. Surfaces join code, stats, the
                      10-week PDF, enroll form, and per-player Certificate links
                      inline so the org doesn't have to jump between cards. */}
                  {(() => {
                    const pkg = team.classPackageId
                      ? classPackages.find(p => p.id === team.classPackageId)
                      : null
                    if (!pkg) return null
                    const isEnrollOpen = enrollOpen === pkg.id
                    const isLbOpen = showLeaderboard === pkg.id
                    const remainingSlots = pkg.player_count - pkg.enrolled_count
                    return (
                      <div className="space-y-4 border border-orange-100 rounded-2xl p-4 bg-orange-50/30">
                        {/* Join code */}
                        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                              Class join code
                              <InfoTip label="Class join code vs organization code" align="left">
                                Players use this code (or the join link) to
                                join this class team. It&rsquo;s different from
                                your organization code, which coaches use to
                                link a new team to your organization.
                              </InfoTip>
                            </p>
                            <p className="text-2xl font-black text-orange-600 tracking-widest mt-0.5">{team.accessCode}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              Share this with your players — up to {pkg.player_count} can join. The org leader uploads videos for each.
                            </p>
                          </div>
                          <button
                            onClick={() => copyToClipboard(`${BASE_URL}/signup?teamCode=${team.accessCode}`, 'Join link copied!')}
                            className="shrink-0 bg-white border border-orange-300 text-orange-600 text-xs font-bold px-3 py-2 rounded-lg hover:bg-orange-100"
                          >
                            Copy join link
                          </button>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { label: 'Players', value: pkg.player_count },
                            { label: 'Enrolled', value: pkg.enrolled_count },
                            { label: 'Completed', value: pkg.completed_count },
                            { label: 'Credits left', value: team.credits },
                          ].map(s => (
                            <div key={s.label} className="bg-white border border-orange-100 rounded-xl px-3 py-2 text-center">
                              <p className="text-xs text-gray-500">{s.label}</p>
                              <p className="text-xl font-black text-black">{s.value}</p>
                            </div>
                          ))}
                        </div>

                        {/* 10-week curriculum PDF */}
                        <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                          <div>
                            <p className="text-sm font-bold text-blue-900">10-Week Session Guide</p>
                            <p className="text-xs text-blue-600">Optional week-by-week curriculum PDF</p>
                          </div>
                          <a
                            href={`/org/curriculum/${pkg.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-blue-700 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-lg transition"
                          >
                            Download PDF →
                          </a>
                        </div>

                        {/* Manual enroll */}
                        {remainingSlots > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Enroll a Player</p>
                              <button
                                onClick={() => { setEnrollOpen(isEnrollOpen ? null : pkg.id); setEnrollSuccess(false); setEnrollError('') }}
                                className="text-sm font-bold text-orange-500 hover:text-orange-400"
                              >
                                {isEnrollOpen ? 'Cancel' : '+ Add Player'}
                              </button>
                            </div>
                            {isEnrollOpen && (
                              <div className="space-y-2 bg-white border border-gray-200 rounded-xl p-4">
                                <input
                                  type="text"
                                  placeholder="First name *"
                                  value={enrollFirstName}
                                  onChange={e => setEnrollFirstName(e.target.value)}
                                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-black text-sm focus:outline-none focus:border-orange-500"
                                />
                                <input
                                  type="text"
                                  placeholder="Last name initial (optional)"
                                  value={enrollLastInit}
                                  onChange={e => setEnrollLastInit(e.target.value)}
                                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-black text-sm focus:outline-none focus:border-orange-500"
                                />
                                <input
                                  type="text"
                                  placeholder="Player account ID (optional — links to their login)"
                                  value={enrollUserId}
                                  onChange={e => setEnrollUserId(e.target.value)}
                                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-black text-sm font-mono focus:outline-none focus:border-orange-500"
                                />
                                {enrollError && <p className="text-red-500 text-sm">{enrollError}</p>}
                                {enrollSuccess && <p className="text-green-600 text-sm font-medium">Player enrolled!</p>}
                                <button
                                  onClick={() => handleEnroll(pkg.id)}
                                  disabled={enrolling || enrollSuccess}
                                  className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
                                >
                                  {enrolling ? 'Enrolling...' : 'Enroll Player'}
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Enrolled players w/ certificate */}
                        {pkg.enrollments.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Enrolled Players ({pkg.enrollments.length})</p>
                              {pkg.enrollments.some(en => en.has_final) && (
                                <Link
                                  href={`/org/class/${pkg.id}/certificates`}
                                  target="_blank"
                                  className="text-xs font-bold text-orange-500 hover:text-orange-400 transition-colors"
                                >
                                  🖨 Print all certificates ({pkg.enrollments.filter(en => en.has_final).length})
                                </Link>
                              )}
                            </div>
                            <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 bg-white">
                              {pkg.enrollments.map(en => {
                                const name = `${en.first_name || 'Player'}${en.last_name_initial ? ' ' + en.last_name_initial + '.' : ''}`
                                const startScore = en.first_score != null ? Number(en.first_score).toFixed(1) : null
                                const finalScore = en.display_final_score != null ? Number(en.display_final_score).toFixed(1) : null
                                return (
                                  <div key={en.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-black">{name}</p>
                                      <p className="text-xs text-gray-400 mt-0.5">
                                        {!en.has_first && 'Not started'}
                                        {en.has_first && !en.has_final && `Start: ${startScore} — awaiting final`}
                                        {en.has_final && `${startScore} → ${finalScore}`}
                                      </p>
                                    </div>
                                    <span
                                      className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${
                                        en.tokens > 0
                                          ? 'bg-orange-50 text-orange-600 border border-orange-200'
                                          : 'bg-gray-50 text-gray-400 border border-gray-200'
                                      }`}
                                      title="Personal analysis tokens on this player's account"
                                    >
                                      {en.tokens} credit{en.tokens !== 1 ? 's' : ''}
                                    </span>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {en.has_final ? (
                                        <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">Done</span>
                                      ) : en.has_first ? (
                                        <span className="text-xs bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded-full">In progress</span>
                                      ) : (
                                        <span className="text-xs bg-gray-100 text-gray-500 font-bold px-2 py-0.5 rounded-full">Not started</span>
                                      )}
                                      {en.has_final && (
                                        <Link
                                          href={`/org/certificate/${en.id}`}
                                          target="_blank"
                                          className="text-xs font-bold text-orange-500 hover:text-orange-400"
                                        >
                                          Certificate
                                        </Link>
                                      )}
                                      {(en.has_first || en.has_final) && (
                                        <button
                                          onClick={() => resetEnrollment(en.id, name)}
                                          disabled={resettingEnrollment === en.id}
                                          title="Clear first/final progress so the next upload counts as their first again"
                                          className="text-xs font-semibold text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                                        >
                                          {resettingEnrollment === en.id ? '…' : 'Reset'}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Class leaderboard toggle */}
                        {pkg.enrollments.some(en => en.has_first) && (
                          <div>
                            <button
                              onClick={() => toggleLeaderboard(pkg.id)}
                              className="text-sm font-bold text-orange-500 hover:text-orange-400"
                            >
                              {isLbOpen ? 'Hide Class Leaderboard' : 'Show Class Leaderboard'}
                            </button>
                            {isLbOpen && (
                              <div className="mt-3 border border-gray-100 rounded-xl overflow-hidden bg-white">
                                <div className="bg-orange-50 px-4 py-2.5 border-b border-orange-100">
                                  <p className="text-sm font-black text-black">Class Leaderboard</p>
                                </div>
                                {leaderboardLoading ? (
                                  <p className="text-sm text-gray-400 p-4">Loading...</p>
                                ) : (
                                  <div className="divide-y divide-gray-100">
                                    {leaderboard.map((en, i) => {
                                      const lbName = `${en.first_name || 'Player'}${en.last_name_initial ? ' ' + en.last_name_initial + '.' : ''}`
                                      const lbScore = en.display_final_score ?? en.first_score
                                      const lbImp = en.first_score != null && en.display_final_score != null
                                        ? (Number(en.display_final_score) - Number(en.first_score)).toFixed(1)
                                        : null
                                      return (
                                        <div key={en.id} className="flex items-center gap-3 px-4 py-2.5">
                                          <span className="text-lg font-black text-gray-300 w-6 text-center">{i + 1}</span>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-black">{lbName}</p>
                                            {lbImp && <p className="text-xs text-green-600 font-medium">+{lbImp} pts</p>}
                                          </div>
                                          {lbScore != null && (
                                            <span className="text-lg font-black text-black">{Number(lbScore).toFixed(1)}</span>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Age group — editable by the org */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Age group</span>
                    <InlineEdit
                      value={team.ageGroup ?? ''}
                      endpoint="/api/org/update-team"
                      bodyKey="ageGroup"
                      extra={{ teamId: team.id }}
                      placeholder="e.g. U15, Varsity"
                      textClassName="text-sm font-semibold text-black"
                      emptyLabel="Not set"
                    />
                  </div>

                  {/* Activation status */}
                  {!team.initiated && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-black flex items-center gap-1.5">
                          Team not yet active
                          <InfoTip label="What does active mean?" align="left">
                            A team becomes active (&ldquo;initiated&rdquo;) at
                            8 players, or automatically when it&rsquo;s part of
                            a class package. Once any of your teams is active,
                            tokens drop from $2.79 to $1.49 across your whole
                            organization.
                          </InfoTip>
                        </p>
                        <span className="text-xs font-black text-orange-500">{team.members.length}/8 players</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-orange-500 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (team.members.length / 8) * 100)}%` }} />
                      </div>
                      <p className="text-xs text-gray-500">
                        {Math.max(0, 8 - team.members.length)} more player{Math.max(0, 8 - team.members.length) !== 1 ? 's' : ''} needed — at 8, every player gets 1 free token{inApp ? '' : ' and tokens unlock at $1.49 each'}.
                      </p>
                      <p className="text-xs text-gray-400">Share the player signup link below to invite players to this team.</p>
                    </div>
                  )}

                  {/* Roster — coach, players, and the player signup link */}
                  <div className="space-y-3">
                    <Section
                      title="Coaches"
                      tipLabel="What can coaches do?"
                      tip="Coaches manage this team from their own coach dashboard: they upload shots for players and can spend the team's credits. Invited coaches show as pending until they finish setting up their account."
                      summary={`${team.coaches.length + 1} coach${team.coaches.length > 0 ? 'es' : ''}`}
                      defaultOpen={false}
                    >
                      <div className="mt-1 border border-gray-100 rounded-xl divide-y divide-gray-100">
                        <div className="flex items-center justify-between gap-3 px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-black truncate">{team.coachNickname || team.adminEmail}</p>
                            {team.coachNickname && <p className="text-xs text-gray-400 truncate">{team.adminEmail}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded-full">Head coach</span>
                            <button
                              onClick={() => removeHeadCoach(team.id)}
                              disabled={removingCoach === `head-${team.id}`}
                              className="text-xs font-semibold text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                            >
                              {removingCoach === `head-${team.id}` ? '…' : 'Remove'}
                            </button>
                          </div>
                        </div>
                        {team.coaches.map(c => (
                          <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-black truncate">{c.nickname || c.email}</p>
                              {c.nickname && <p className="text-xs text-gray-400 truncate">{c.email}</p>}
                            </div>
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
                        <p className="text-sm text-gray-400 mt-0.5">No players have joined yet.</p>
                      ) : (
                        <>
                          <div className="mt-1 border border-gray-100 rounded-xl divide-y divide-gray-100">
                            {sortedMembers(team).map(m => (
                              <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={!!emailSelected[m.id]}
                                    onChange={() => toggleEmailMember(m.id)}
                                    className="w-4 h-4 accent-orange-500 shrink-0"
                                  />
                                  <Link
                                    href={`/org/dashboard/member/${m.id}`}
                                    className="text-sm font-semibold text-black truncate hover:text-orange-600 hover:underline transition-colors"
                                  >
                                    {memberDisplayName(m)}
                                  </Link>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-gray-400 truncate max-w-[9rem]">{m.email}</span>
                                  <button
                                    onClick={() => removePlayer(team.id, m.id)}
                                    disabled={removingPlayer === m.id}
                                    className="text-xs font-semibold text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors"
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
                              className="mt-2 text-sm font-bold text-orange-500 hover:text-orange-400 transition-colors"
                            >
                              ✉ Draft outreach email ({team.members.filter(m => emailSelected[m.id]).length} selected)
                            </button>
                          )}
                        </>
                      )}
                    </Section>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                        Player signup link
                        <InfoTip label="What is the player signup link?" align="left">
                          Send this to players (or their parents). It opens the
                          signup page with this team&rsquo;s code pre-filled, so
                          they land on the roster automatically.
                        </InfoTip>
                      </p>
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

                  {/* Token balances — only on non-class teams. Class teams
                      already show their stats (Players / Enrolled / Completed /
                      Credits left) in the class panel above, so this duplicate
                      block is redundant and the "PLAYERS — N TOKENS TOTAL"
                      line is misleading in a coach-uploads-for-players model. */}
                  {!team.classPackageId && (
                    <TokenBalances
                      players={team.members.map(m => ({ id: m.id, label: memberDisplayName(m), tokens: m.tokens }))}
                      coachCredits={team.credits}
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
                      <div className="border border-orange-100 rounded-xl overflow-hidden">
                        <button
                          onClick={() => setTeamAssignOpen(prev => ({ ...prev, [team.id]: !isAssignOpen }))}
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-orange-50 hover:bg-orange-100 transition-colors text-left"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-black">Assign team credits to players</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Team credits: <span className="font-bold text-orange-600">{team.credits}</span>
                              {' '}— spend on specific players in this team.
                            </p>
                          </div>
                          <span className="text-gray-400 text-sm shrink-0">{isAssignOpen ? '−' : '+'}</span>
                        </button>
                        {isAssignOpen && (
                          <div className="px-4 py-4 space-y-3 bg-white">
                            {team.members.length === 0 ? (
                              <p className="text-sm text-gray-400">No players have joined this team yet.</p>
                            ) : team.credits === 0 ? (
                              <p className="text-sm text-gray-500">No credits on this team yet — allocate some from your org balance above.</p>
                            ) : (
                              <>
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tokens per player</label>
                                  <div className="flex items-center gap-2">
                                    {[1, 2, 5].map(q => (
                                      <button
                                        key={q}
                                        onClick={() => setTeamAssignEach(prev => ({ ...prev, [team.id]: q }))}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                                          each === q
                                            ? 'bg-orange-500 text-white'
                                            : 'bg-white border border-gray-300 text-black hover:border-orange-400'
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
                                      className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-black text-sm text-center focus:outline-none focus:border-orange-500"
                                    />
                                  </div>
                                </div>

                                <div className="space-y-1 border border-gray-100 rounded-xl divide-y divide-gray-100 max-h-56 overflow-y-auto">
                                  {team.members.map(m => (
                                    <label key={m.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50">
                                      <input
                                        type="checkbox"
                                        checked={!!picks[m.id]}
                                        onChange={() => setTeamAssignPicks(prev => ({
                                          ...prev,
                                          [team.id]: { ...(prev[team.id] || {}), [m.id]: !(prev[team.id]?.[m.id]) },
                                        }))}
                                        className="w-4 h-4 accent-orange-500"
                                      />
                                      <span className="flex-1 text-sm text-black">{memberDisplayName(m)}</span>
                                      <span className="text-xs text-gray-400">{m.tokens} token{m.tokens !== 1 ? 's' : ''}</span>
                                    </label>
                                  ))}
                                </div>

                                <p className="text-xs text-gray-500">
                                  {selectedIds.length} player{selectedIds.length !== 1 ? 's' : ''} selected
                                  {selectedIds.length > 0 && ` · ${totalNeeded} credit${totalNeeded !== 1 ? 's' : ''} total`}
                                  {totalNeeded > team.credits && (
                                    <span className="text-red-500 font-semibold"> · not enough credits</span>
                                  )}
                                </p>

                                {msg && (
                                  <p className={`text-sm font-medium ${msg.startsWith('Assigned') ? 'text-green-600' : 'text-red-500'}`}>
                                    {msg}
                                  </p>
                                )}

                                <button
                                  onClick={() => assignTeamCreditsToPlayers(team.id, team.credits)}
                                  disabled={isAssignBusy || selectedIds.length === 0 || totalNeeded > team.credits}
                                  className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
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
                    defaultOpen={false}
                  >
                    <div className="space-y-2 pt-1">
                      {team.leaderboard.length > 0 && (
                        <div className="flex justify-end">
                          <button
                            onClick={() => setTeamLbModal(team.id)}
                            className="shrink-0 text-xs font-bold text-orange-500 hover:text-orange-400 transition-colors"
                          >
                            View full &amp; print
                          </button>
                        </div>
                      )}
                      {team.leaderboard.length === 0 ? (
                        <p className="text-sm text-gray-400">No shots analyzed yet.</p>
                      ) : (
                        <LeaderboardTable entries={team.leaderboard} context="org" />
                      )}
                    </div>
                  </Section>

                  {/* Buy tokens — collapsible. Hidden in the iOS app (guideline 3.1.1). */}
                  {!inApp && (
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setBuyOpen(prev => ({ ...prev, [team.id]: !isBuyOpen }))}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 hover:bg-orange-50 transition-colors text-left"
                    >
                      <p className="text-sm font-bold text-black">Buy Tokens for This Team</p>
                      <span className="text-gray-400 text-sm shrink-0">{isBuyOpen ? '−' : '+'}</span>
                    </button>
                    {isBuyOpen && (
                      <div className="px-4 py-4 space-y-3">
                        {!team.initiated && !teams.some(t => t.initiated) && (
                          <p className="text-xs text-orange-600 font-semibold">Team not yet active — tokens are $2.79 each until any of your teams reaches 8 players.</p>
                        )}
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Send to</label>
                          <select
                            value={dest}
                            onChange={e => setDestSelect(prev => ({ ...prev, [team.id]: e.target.value }))}
                            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-black bg-white focus:outline-none focus:border-orange-500"
                          >
                            <option value="all">All Players ({team.members.length})</option>
                            {team.members.map(m => (
                              <option key={m.id} value={m.id}>
                                {memberDisplayName(m)} — {m.tokens} token{m.tokens !== 1 ? 's' : ''}
                              </option>
                            ))}
                            <option value="coach">Coach Credits (balance: {team.credits})</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            {dest === 'coach' ? 'Credits' : 'Tokens per player'}
                          </label>
                          <select
                            value={qty}
                            onChange={e => setQuantity(prev => ({ ...prev, [team.id]: Number(e.target.value) }))}
                            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-black bg-white focus:outline-none focus:border-orange-500"
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
                            className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold py-2.5 rounded-xl text-sm transition-colors"
                          >
                            {buying ? 'Redirecting...' : 'Buy Tokens'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  )}

                  {/* Danger zone — delete this team */}
                  <Section title="Danger zone" summary="Delete team" defaultOpen={false}>
                    <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-xs text-gray-400 max-w-sm">
                        Permanently delete this team, its roster, and its coaches.
                        Players keep their own shot history. This can&apos;t be undone.
                      </p>
                      <button
                        onClick={() => deleteTeam(team)}
                        disabled={deletingTeam === team.id}
                        className="shrink-0 bg-white border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 font-bold px-3 py-1.5 rounded-xl text-sm transition-colors"
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

  const classTab = (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-black text-black">10-Week Shooting Class</h2>
        <InfoTip label="What does the 10-week class include?" align="left">
          $40 per player ($36.99 each for 30+). Every player gets a training
          ball, 2 AI shot analyses (start and end of the class), and a
          personalized completion certificate. Buying a package also creates a
          class team and unlocks the $1.49 token rate for your organization.
        </InfoTip>
      </div>
      {classProgramSection}
    </div>
  )

  const tokensTab = (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-black text-black">Tokens &amp; Credits</h2>
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
        teams={teams.map(t => ({ id: t.id, name: t.name, coachName: t.coachNickname || t.adminEmail, ageGroup: t.ageGroup, initiated: t.initiated, memberCount: t.members.length, credits: t.credits }))}
        totalPlayerTokens={totalPlayerTokens}
        totalCoachCredits={totalCoachCredits}
      />
    </div>
  )

  const uploadsTab = (
    <div className="space-y-4">
      {/* My Uploads — the org owner's own analyzed shots, collapsible */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowMyUploads(o => !o)}
          className="w-full flex items-center justify-between gap-4 px-5 py-4 bg-gray-50 hover:bg-orange-50 transition-colors text-left"
        >
          <div>
            <p className="font-bold text-black">My Uploads</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {myUploads.length} of your own analyzed shot{myUploads.length !== 1 ? 's' : ''}
            </p>
          </div>
          <span className="text-gray-400 text-lg">{showMyUploads ? '−' : '+'}</span>
        </button>
        {showMyUploads && (
          <div className="p-4 space-y-3">
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
        )}
      </div>
    </div>
  )

  const playersTab = (
    <div className="space-y-4">
      {/* All players across the organization — collapsible */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowAllPlayers(o => !o)}
          className="w-full flex items-center justify-between gap-4 px-5 py-4 bg-gray-50 hover:bg-orange-50 transition-colors text-left"
        >
          <div>
            <p className="font-bold text-black">All Players</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Every player across the organization, with their best score and team
            </p>
          </div>
          <span className="text-gray-400 text-lg">{showAllPlayers ? '−' : '+'}</span>
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
                  <p className="text-sm text-gray-400">
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
                    <p className="text-xs text-gray-400">
                      {rows.length} player{rows.length !== 1 ? 's' : ''}
                    </p>
                    <SortMenu
                      value={allPlayersSort}
                      options={PLAYER_SORT_OPTIONS}
                      onChange={setAllPlayersSort}
                    />
                  </div>
                  <div className="border border-gray-200 rounded-2xl overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-3 py-3 w-8"></th>
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Player</th>
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Teams</th>
                          <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Best Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rows.map(({ member: m, teams: memberTeams, score }) => (
                          <tr key={m.id} className="bg-white">
                            <td className="px-3 py-2.5">
                              <input
                                type="checkbox"
                                checked={!!emailSelected[m.id]}
                                onChange={() => toggleEmailMember(m.id)}
                                className="w-4 h-4 accent-orange-500"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <Link
                                href={`/org/dashboard/member/${m.id}`}
                                className="text-sm font-semibold text-black hover:text-orange-600 hover:underline transition-colors"
                              >
                                {memberDisplayName(m)}
                              </Link>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="text-sm text-gray-700">
                                {memberTeams.map((tm, i) => (
                                  <span key={tm.teamId}>
                                    <button
                                      onClick={() => goToTeam(tm.teamId)}
                                      className="text-orange-600 hover:text-orange-500 hover:underline transition-colors"
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
                                <span className="text-xs text-gray-400">No shots</span>
                              ) : (
                                <span
                                  className={`font-black text-base ${
                                    score >= 8
                                      ? 'text-green-600'
                                      : score >= 6
                                        ? 'text-orange-500'
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
                      className="text-sm font-bold text-orange-500 hover:text-orange-400 transition-colors"
                    >
                      ✉ Draft outreach email ({selectedCount} selected)
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
      <section className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Org Token Balance</h2>
          <InfoTip label="How do org tokens work?" align="left">
            Tokens you buy land in this org balance first. From the Tokens tab
            you can assign them to players, allocate them to teams as coach
            credits, give a coach personal upload credits, or spend them on
            your own uploads. 1 token = 1 AI shot analysis.
          </InfoTip>
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-black">{orgTokenBalance}</span>
            <span className="text-gray-500 text-sm">token{orgTokenBalance !== 1 ? 's' : ''} unassigned</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span>
              <span className="font-black text-black">{totalPlayerTokens}</span> player token{totalPlayerTokens !== 1 ? 's' : ''}
            </span>
            <span>
              <span className="font-black text-black">{totalCoachCredits}</span> coach credit{totalCoachCredits !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </section>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <AccountTabs
        tabs={[
          { id: 'teams', label: 'Teams', count: teams.length, content: teamsTab },
          // The class purchase pitch is hidden in the iOS app (guideline 3.1.1).
          ...(inApp ? [] : [{ id: 'class', label: 'Shooting Class', content: classTab }]),
          { id: 'tokens', label: 'Tokens', content: tokensTab },
          { id: 'players', label: 'Players', count: uniquePlayerCount, content: playersTab },
          { id: 'uploads', label: 'My Uploads', count: myUploads.length, content: uploadsTab },
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
              className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-auto p-6 space-y-5"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-black text-black">Outreach Email Draft</h2>
                <button onClick={() => setEmailDraftTeam(null)} className="text-gray-400 hover:text-black text-2xl leading-none">×</button>
              </div>

              {/* Emails block */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Recipient emails ({selected.length})
                  </p>
                  <button
                    onClick={() => copyText(emailList, 'emails')}
                    className="text-xs font-bold text-orange-500 hover:text-orange-400 transition-colors"
                  >
                    {emailCopied === 'emails' ? 'Copied!' : 'Copy all emails'}
                  </button>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 break-all leading-relaxed">
                  {emailList}
                </div>
                <p className="text-xs text-gray-400">Paste these into the To or BCC field of your email client.</p>
              </div>

              {/* Body block */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email body</p>
                  <button
                    onClick={() => copyText(body, 'body')}
                    className="text-xs font-bold text-orange-500 hover:text-orange-400 transition-colors"
                  >
                    {emailCopied === 'body' ? 'Copied!' : 'Copy body'}
                  </button>
                </div>
                <pre className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-sans">
                  {body}
                </pre>
                <p className="text-xs text-gray-400">Fill in the bracketed sections with your own class details before sending.</p>
              </div>

              <p className="text-xs text-gray-400 border-t border-gray-100 pt-4">
                Selected: {names.join(', ')}
              </p>
            </div>
          </div>,
          document.body,
        )
      })()}

      {/* Team leaderboard popup with print — portaled to <body> for a clean printout */}
      {teamLbModal && (() => {
        const t = teams.find(tm => tm.id === teamLbModal)
        if (!t) return null
        return createPortal(
          <div
            className="leaderboard-modal-backdrop fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setTeamLbModal(null)}
          >
            <div
              className="leaderboard-modal bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-auto p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-black text-black">{t.name} Leaderboard</h2>
                <div className="flex items-center gap-2 print:hidden">
                  <PrintButton label="Print" />
                  <button
                    onClick={() => setTeamLbModal(null)}
                    className="shrink-0 text-sm font-semibold text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
              <LeaderboardTable entries={t.leaderboard} context="org" />
            </div>
          </div>,
          document.body,
        )
      })()}
    </div>
  )
}
