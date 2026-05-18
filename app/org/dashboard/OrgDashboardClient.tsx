'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import OrgAddCoach from './OrgAddCoach'
import TokenBalances from '@/components/TokenBalances'
import InlineEdit from '@/components/InlineEdit'
import { CLASS_MIN_PLAYERS, CLASS_BULK_THRESHOLD, classPriceCents } from '@/lib/org-class-pricing'

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
  members: Member[]
  coaches: Coach[]
  coachNickname: string | null
  initiated: boolean
  tokenPool: number
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
  enrollments: ClassEnrollment[]
}

interface Props {
  teams: TeamData[]
  orgName: string
  classPackages: ClassPackage[]
}


export default function OrgDashboardClient({ teams, orgName, classPackages }: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState<string | null>(teams[0]?.id ?? null)
  // destSelect: 'all' | 'coach' | userId — one dropdown replaces mode+checkboxes
  const [destSelect, setDestSelect] = useState<Record<string, string>>({})
  const [quantity, setQuantity] = useState<Record<string, number>>({})
  const [buyOpen, setBuyOpen] = useState<Record<string, boolean>>({})
  const [buying, setBuying] = useState(false)
  const [error, setError] = useState<Record<string, string>>({})
  const [copiedLink, setCopiedLink] = useState<Record<string, boolean>>({})
  const [removingCoach, setRemovingCoach] = useState<string | null>(null)
  const [removingPlayer, setRemovingPlayer] = useState<string | null>(null)
  const [tokenOverviewOpen, setTokenOverviewOpen] = useState(true)

  const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://learnhoops.com'

  // Class program state
  const [classPlayerCount, setClassPlayerCount] = useState(CLASS_MIN_PLAYERS)
  const [buyingClass, setBuyingClass] = useState(false)
  const [classError, setClassError] = useState('')
  const [expandedPackage, setExpandedPackage] = useState<string | null>(classPackages[0]?.id ?? null)
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

  // Purchase tokens section state
  const [ptTeamId, setPtTeamId] = useState<string>(teams[0]?.id ?? '')
  const [ptRecipient, setPtRecipient] = useState('all')  // 'all' | 'coach' | userId
  const [ptQty, setPtQty] = useState(1)
  const [ptOpen, setPtOpen] = useState(true)
  const [buyingTokens, setBuyingTokens] = useState(false)
  const [tokensError, setTokensError] = useState('')

  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAgeGroup, setNewAgeGroup] = useState('')
  const [newCoachEmail, setNewCoachEmail] = useState('')
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

  function memberDisplayName(m: Member) {
    if (m.first_name) {
      return `${m.first_name}${m.last_name_initial ? ' ' + m.last_name_initial + '.' : ''}`
    }
    return m.email
  }

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

  async function handleBuyTokens() {
    const team = selectedPtTeam
    if (!team) return
    setBuyingTokens(true)
    setTokensError('')
    try {
      if (ptRecipient === 'coach') {
        const res = await fetch('/api/org/buy-team-credits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId: team.id, quantity: ptQty }),
        })
        const data = await res.json()
        if (!res.ok || !data.url) {
          setTokensError(data.error || 'Checkout failed')
          setBuyingTokens(false)
          return
        }
        window.location.href = data.url
      } else {
        const playerUserIds = ptRecipient === 'all' ? team.members.map(m => m.id) : [ptRecipient]
        if (playerUserIds.length === 0) {
          setTokensError('No players have joined this team yet')
          setBuyingTokens(false)
          return
        }
        const res = await fetch('/api/org/buy-player-tokens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerUserIds, quantity: ptQty, teamId: team.id }),
        })
        const data = await res.json()
        if (!res.ok || !data.url) {
          setTokensError(data.error || 'Checkout failed')
          setBuyingTokens(false)
          return
        }
        window.location.href = data.url
      }
    } catch {
      setTokensError('Something went wrong. Please try again.')
      setBuyingTokens(false)
    }
  }

  async function handleBuyClass() {
    setBuyingClass(true)
    setClassError('')
    try {
      const res = await fetch('/api/org/buy-class-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerCount: classPlayerCount }),
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
  const anyInitiated = teams.some(t => t.initiated)
  const classTotal = classPriceCents(classPlayerCount) / 100

  const classProgramSection = (
    <div className="space-y-4">
      {/* Program summary + buy form — all one card */}
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
          <div className="bg-white/20 rounded-xl px-4 py-3 text-center shrink-0">
            <p className="text-4xl font-black">$40</p>
            <p className="text-orange-100 text-xs">per player</p>
            <p className="text-orange-200 text-xs mt-1">$36.99/player for 30+</p>
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
          <p className="text-orange-100 text-xs">Minimum {CLASS_MIN_PLAYERS} players. Each player gets 2 analysis tokens + a certificate when they complete both evaluations.</p>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-orange-200 uppercase tracking-wide">Number of players</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setClassPlayerCount(c => Math.max(CLASS_MIN_PLAYERS, c - 1))}
                className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white font-bold transition-colors flex items-center justify-center"
              >−</button>
              <span className="text-2xl font-black text-white w-12 text-center">{classPlayerCount}</span>
              <button
                onClick={() => setClassPlayerCount(c => c + 1)}
                className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white font-bold transition-colors flex items-center justify-center"
              >+</button>
              <input
                type="number"
                min={CLASS_MIN_PLAYERS}
                value={classPlayerCount}
                onChange={e => setClassPlayerCount(Math.max(CLASS_MIN_PLAYERS, parseInt(e.target.value) || CLASS_MIN_PLAYERS))}
                className="w-20 bg-white/20 border border-white/30 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-white placeholder-orange-200"
              />
            </div>
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

          <button
            onClick={handleBuyClass}
            disabled={buyingClass}
            className="w-full bg-white hover:bg-orange-50 disabled:bg-white/60 text-orange-600 font-black py-3 rounded-xl transition-colors"
          >
            {buyingClass ? 'Redirecting to checkout...' : `Buy Class Package — $${classTotal.toLocaleString()}`}
          </button>
        </div>
      </div>

      {/* Active class packages */}
      {classPackages.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-black text-black text-lg">Active Class Programs</h3>
          {classPackages.map(pkg => {
            const isOpen = expandedPackage === pkg.id
            const purchasedAt = new Date(pkg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            return (
              <div key={pkg.id} className="border border-gray-200 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setExpandedPackage(isOpen ? null : pkg.id)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 bg-gray-50 hover:bg-orange-50 transition-colors text-left"
                >
                  <div>
                    <p className="font-bold text-black">{pkg.player_count}-Player Class Package</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {pkg.enrolled_count}/{pkg.player_count} enrolled · {pkg.completed_count} completed · purchased {purchasedAt}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pkg.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {pkg.status}
                    </span>
                    <span className="text-gray-400 text-sm">{isOpen ? '−' : '+'}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 py-4 space-y-5">
                    {/* Stats row */}
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: 'Players', value: pkg.player_count },
                        { label: 'Enrolled', value: pkg.enrolled_count },
                        { label: 'Completed', value: pkg.completed_count },
                        { label: 'Tokens left', value: pkg.token_pool },
                      ].map(s => (
                        <div key={s.label} className="bg-orange-50 border border-orange-100 rounded-xl px-3 py-2 text-center">
                          <p className="text-xs text-gray-500">{s.label}</p>
                          <p className="text-xl font-black text-black">{s.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Enroll a player */}
                    {pkg.enrolled_count < pkg.player_count && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Enroll a Player</p>
                          <button
                            onClick={() => { setEnrollOpen(enrollOpen === pkg.id ? null : pkg.id); setEnrollSuccess(false); setEnrollError('') }}
                            className="text-sm font-bold text-orange-500 hover:text-orange-400"
                          >
                            {enrollOpen === pkg.id ? 'Cancel' : '+ Add Player'}
                          </button>
                        </div>
                        {enrollOpen === pkg.id && (
                          <div className="space-y-2 bg-gray-50 border border-gray-200 rounded-xl p-4">
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

                    {/* Enrolled players list */}
                    {pkg.enrollments.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Enrolled Players ({pkg.enrollments.length})</p>
                        <div className="border border-gray-100 rounded-xl divide-y divide-gray-100">
                          {pkg.enrollments.map(e => {
                            const name = `${e.first_name || 'Player'}${e.last_name_initial ? ' ' + e.last_name_initial + '.' : ''}`
                            const startScore = e.first_score != null ? Number(e.first_score).toFixed(1) : null
                            const finalScore = e.display_final_score != null ? Number(e.display_final_score).toFixed(1) : null
                            return (
                              <div key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-black">{name}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {!e.has_first && 'Not started'}
                                    {e.has_first && !e.has_final && `Start: ${startScore} — awaiting final`}
                                    {e.has_final && `${startScore} → ${finalScore}`}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {e.has_final ? (
                                    <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">Done</span>
                                  ) : e.has_first ? (
                                    <span className="text-xs bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded-full">In progress</span>
                                  ) : (
                                    <span className="text-xs bg-gray-100 text-gray-500 font-bold px-2 py-0.5 rounded-full">Not started</span>
                                  )}
                                  {e.has_final && (
                                    <Link
                                      href={`/org/certificate/${e.id}`}
                                      target="_blank"
                                      className="text-xs font-bold text-orange-500 hover:text-orange-400"
                                    >
                                      Certificate
                                    </Link>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Leaderboard toggle */}
                    {pkg.enrollments.some(e => e.has_first) && (
                      <div>
                        <button
                          onClick={() => toggleLeaderboard(pkg.id)}
                          className="text-sm font-bold text-orange-500 hover:text-orange-400"
                        >
                          {showLeaderboard === pkg.id ? 'Hide Leaderboard' : 'Show Leaderboard'}
                        </button>
                        {showLeaderboard === pkg.id && (
                          <div className="mt-3 border border-gray-100 rounded-xl overflow-hidden">
                            <div className="bg-orange-50 px-4 py-2.5 border-b border-orange-100">
                              <p className="text-sm font-black text-black">Class Leaderboard</p>
                            </div>
                            {leaderboardLoading ? (
                              <p className="text-sm text-gray-400 p-4">Loading...</p>
                            ) : (
                              <div className="divide-y divide-gray-100">
                                {leaderboard.map((e, i) => {
                                  const name = `${e.first_name || 'Player'}${e.last_name_initial ? ' ' + e.last_name_initial + '.' : ''}`
                                  const score = e.display_final_score ?? e.first_score
                                  const improvement = e.first_score != null && e.display_final_score != null
                                    ? (Number(e.display_final_score) - Number(e.first_score)).toFixed(1)
                                    : null
                                  return (
                                    <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                                      <span className="text-lg font-black text-gray-300 w-6 text-center">{i + 1}</span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-black">{name}</p>
                                        {improvement && (
                                          <p className="text-xs text-green-600 font-medium">+{improvement} pts</p>
                                        )}
                                      </div>
                                      {score != null && (
                                        <span className="text-lg font-black text-black">{Number(score).toFixed(1)}</span>
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
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const selectedPtTeam = teams.find(t => t.id === ptTeamId) ?? teams[0]
  const ptIsCoach = ptRecipient === 'coach'
  const ptPlayerCount = !selectedPtTeam || ptIsCoach ? 0
    : ptRecipient === 'all' ? selectedPtTeam.members.length
    : 1
  const ptPricePerToken = selectedPtTeam?.initiated ? 1.49 : 2.79
  const ptTotal = ptPlayerCount * ptQty * ptPricePerToken

  const purchaseTokensSection = (
    <div className="border-2 border-orange-200 rounded-2xl bg-white overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setPtOpen(o => !o)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-orange-50 transition-colors text-left"
      >
        <div>
          <h2 className="text-xl font-black text-black">Purchase Tokens</h2>
          <p className="text-sm text-gray-500">Buy analysis tokens for your players</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {anyInitiated ? (
            <span className="bg-green-100 text-green-700 text-xs font-black px-2.5 py-1 rounded-full">$1.49 / token</span>
          ) : (
            <span className="bg-gray-100 text-gray-600 text-xs font-black px-2.5 py-1 rounded-full">$2.79 / token</span>
          )}
          <span className="text-gray-400 text-sm">{ptOpen ? '−' : '+'}</span>
        </div>
      </button>

      {ptOpen && (
        <div className="px-5 pb-5 space-y-3 border-t border-orange-100">
          {/* Pricing notice + team progress when no team is initiated */}
          {!anyInitiated && teams.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-4 space-y-3 mt-3">
              <p className="text-sm font-black text-orange-900">Tokens drop to $1.49 once a team reaches 8 players</p>
              <p className="text-xs text-orange-700">Currently $2.79 each — get more players to unlock the lower price.</p>
              <div className="space-y-2 pt-1">
                {teams.map(t => {
                  const pct = Math.min(100, (t.members.length / 8) * 100)
                  const needed = Math.max(0, 8 - t.members.length)
                  return (
                    <div key={t.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-orange-800">{t.name}</p>
                        <p className="text-xs text-orange-700 shrink-0">{t.members.length}/8</p>
                      </div>
                      <div className="w-full bg-orange-200 rounded-full h-1.5">
                        <div className="bg-orange-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      {needed > 0 && (
                        <p className="text-xs text-orange-600">{needed} more player{needed !== 1 ? 's' : ''} to unlock $1.49</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {teams.length === 0 ? (
            <p className="text-sm text-gray-400 pt-3">Add a team first to purchase tokens for players.</p>
          ) : (
            <div className="space-y-3 pt-3">
              {/* Team dropdown */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Team</label>
                <select
                  value={ptTeamId || (teams[0]?.id ?? '')}
                  onChange={e => { setPtTeamId(e.target.value); setPtRecipient('all') }}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-black bg-white focus:outline-none focus:border-orange-500"
                >
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} — {t.members.length} player{t.members.length !== 1 ? 's' : ''} ({t.initiated ? '$1.49' : '$2.79'}/token)
                    </option>
                  ))}
                </select>
              </div>

              {/* Recipient dropdown */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Send to</label>
                <select
                  value={ptRecipient}
                  onChange={e => setPtRecipient(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-black bg-white focus:outline-none focus:border-orange-500"
                >
                  <option value="all">All Players ({selectedPtTeam?.members.length ?? 0})</option>
                  {selectedPtTeam?.members.map(m => (
                    <option key={m.id} value={m.id}>
                      {memberDisplayName(m)} — {m.tokens} token{m.tokens !== 1 ? 's' : ''}
                    </option>
                  ))}
                  <option value="coach">Coach Credits</option>
                </select>
              </div>

              {/* Quantity dropdown */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {ptIsCoach ? 'Credits' : 'Tokens per player'}
                </label>
                <select
                  value={ptQty}
                  onChange={e => setPtQty(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-black bg-white focus:outline-none focus:border-orange-500"
                >
                  <option value={1}>1</option>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                </select>
              </div>

              {/* Total (player tokens only) */}
              {ptPlayerCount > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    {ptQty} token{ptQty > 1 ? 's' : ''} × {ptPlayerCount} player{ptPlayerCount !== 1 ? 's' : ''} × ${ptPricePerToken}
                  </p>
                  <p className="text-lg font-black text-black">${ptTotal.toFixed(2)}</p>
                </div>
              )}

              {tokensError && <p className="text-red-500 text-sm">{tokensError}</p>}

              <button
                onClick={handleBuyTokens}
                disabled={buyingTokens}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-black py-3 rounded-xl transition-colors"
              >
                {buyingTokens ? 'Redirecting to checkout...' : 'Purchase Tokens'}
              </button>
            </div>
          )}
        </div>
      )}
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
        {purchaseTokensSection}
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

  return (
    <div className="space-y-4">
      {purchaseTokensSection}
      {classProgramSection}
      {addTeamSection}

      {(() => {
        const totalPool = teams.reduce((s, t) => s + t.tokenPool, 0)
        const totalCredits = teams.reduce((s, t) => s + t.credits, 0)
        const totalPlayerTokens = teams.reduce(
          (s, t) => s + t.members.reduce((ps, m) => ps + m.tokens, 0), 0,
        )
        return (
          <div className="border border-gray-200 rounded-2xl overflow-hidden">
            <button
              onClick={() => setTokenOverviewOpen(o => !o)}
              className="w-full flex items-center justify-between gap-4 px-5 py-4 bg-gray-50 hover:bg-orange-50 transition-colors text-left"
            >
              <h2 className="text-xl font-black text-black">Token Overview</h2>
              <span className="text-gray-400 text-sm">{tokenOverviewOpen ? '−' : '+'}</span>
            </button>
            {tokenOverviewOpen && (
              <div className="px-5 pb-5 pt-3 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                    <p className="text-xs text-gray-500">Team pools</p>
                    <p className="text-2xl font-black text-black">{totalPool}</p>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                    <p className="text-xs text-gray-500">Player tokens</p>
                    <p className="text-2xl font-black text-black">{totalPlayerTokens}</p>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                    <p className="text-xs text-gray-500">Coach credits</p>
                    <p className="text-2xl font-black text-black">{totalCredits}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  Across {teams.length} team{teams.length !== 1 ? 's' : ''}. Expand a team below for its per-player breakdown.
                </p>
              </div>
            )}
          </div>
        )
      })()}

      <h2 className="text-xl font-black text-black">Your Teams</h2>

      <div className="space-y-3">
        {teams.map(team => {
          const isOpen = expanded === team.id
          const dest = getDestSelect(team.id)
          const qty = getQty(team.id)
          const teamError = error[team.id]
          const isBuyOpen = buyOpen[team.id] ?? false

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
                        <p className="text-sm font-bold text-black">Team not yet active</p>
                        <span className="text-xs font-black text-orange-500">{team.members.length}/8 players</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-orange-500 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (team.members.length / 8) * 100)}%` }} />
                      </div>
                      <p className="text-xs text-gray-500">
                        {Math.max(0, 8 - team.members.length)} more player{Math.max(0, 8 - team.members.length) !== 1 ? 's' : ''} needed — at 8, every player gets 1 free token and tokens unlock at $1.49 each.
                      </p>
                    </div>
                  )}

                  {/* Roster — coach, players, and the player signup link */}
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Coaches</p>
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
                              <Link
                                href={`/org/dashboard/member/${m.id}`}
                                className="text-sm font-semibold text-black truncate hover:text-orange-600 hover:underline transition-colors"
                              >
                                {memberDisplayName(m)}
                              </Link>
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

                  {/* Token balances */}
                  <TokenBalances
                    players={team.members.map(m => ({ id: m.id, label: memberDisplayName(m), tokens: m.tokens }))}
                    coachCredits={team.credits}
                    tokenPool={team.tokenPool}
                  />

                  {/* Buy tokens — collapsible, only available once initiated */}
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
                        {!team.initiated && (
                          <p className="text-xs text-orange-600 font-semibold">Team not yet active — tokens are $2.79 each until the team reaches 8 players.</p>
                        )}
                        {/* Recipient dropdown */}
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
                        {/* Quantity dropdown */}
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
                        <button
                          onClick={() => handleBuy(team)}
                          disabled={buying}
                          className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold py-2.5 rounded-xl text-sm transition-colors"
                        >
                          {buying ? 'Redirecting...' : 'Buy Tokens'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
