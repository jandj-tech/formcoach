'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { copyToClipboard } from '@/lib/copy'
import { BookOpenIcon, PrinterIcon, TrophyIcon } from 'lucide-react'

export interface ClassManagerEnrollment {
  id: string
  user_id: string | null
  first_name: string | null
  last_name_initial: string | null
  first_score: number | null
  display_final_score: number | null
  has_first: boolean
  has_final: boolean
  tokens: number
}

export interface ClassManagerPackage {
  id: string
  player_count: number
  status: string
  created_at: string
  enrolled_count: number
  completed_count: number
  team_access_code: string | null
  enrollments: ClassManagerEnrollment[]
  /** Present when the caller knows which team runs this package. */
  teamName?: string | null
  teamCredits?: number | null
}

interface Props {
  packages: ClassManagerPackage[]
  /** Org owners can enroll and reset; coaches manage their own class the same way. */
  canManage?: boolean
  /** Where the "buy another package" CTA should send people (org only). */
  onStartAnother?: () => void
}

const TOTAL_WEEKS = 10

function playerName(en: { first_name: string | null; last_name_initial: string | null }) {
  return `${en.first_name || 'Player'}${en.last_name_initial ? ' ' + en.last_name_initial + '.' : ''}`
}

/** Week 1 is the week of purchase; clamp so a long-finished class reads "complete". */
function currentWeek(createdAt: string): number {
  const started = new Date(createdAt).getTime()
  if (Number.isNaN(started)) return 1
  const weeks = Math.floor((Date.now() - started) / (7 * 24 * 60 * 60 * 1000)) + 1
  return Math.min(Math.max(weeks, 1), TOTAL_WEEKS)
}

export default function ClassManager({ packages, canManage = false, onStartAnother }: Props) {
  const router = useRouter()

  const [enrollOpen, setEnrollOpen] = useState<string | null>(null)
  const [enrollFirstName, setEnrollFirstName] = useState('')
  const [enrollLastInit, setEnrollLastInit] = useState('')
  const [enrolling, setEnrolling] = useState(false)
  const [enrollError, setEnrollError] = useState('')
  const [enrollSuccess, setEnrollSuccess] = useState(false)
  const [resetting, setResetting] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [boardOpen, setBoardOpen] = useState<string | null>(null)

  async function handleEnroll(packageId: string) {
    if (!enrollFirstName.trim()) {
      setEnrollError('First name is required.')
      return
    }
    setEnrolling(true)
    setEnrollError('')
    try {
      const res = await fetch('/api/org/class/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId,
          firstName: enrollFirstName.trim(),
          lastNameInitial: enrollLastInit.trim() || null,
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
      router.refresh()
      setTimeout(() => setEnrollSuccess(false), 2500)
    } catch {
      setEnrollError('Something went wrong. Please try again.')
    }
    setEnrolling(false)
  }

  async function resetEnrollment(enrollmentId: string, name: string) {
    if (!confirm(`Clear all class progress for ${name}? Their next upload will count as their FIRST again.`)) return
    setResetting(enrollmentId)
    try {
      const res = await fetch('/api/org/reset-enrollment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Could not reset enrollment.')
      } else {
        router.refresh()
      }
    } catch {
      alert('Something went wrong.')
    }
    setResetting(null)
  }

  async function copyJoinLink(pkg: ClassManagerPackage) {
    if (!pkg.team_access_code) return
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://learnhoops.com'
    await copyToClipboard(`${origin}/signup?teamCode=${pkg.team_access_code}`, 'Signup link copied!')
    setCopied(pkg.id)
    setTimeout(() => setCopied(null), 1800)
  }

  return (
    <div className="space-y-6">
      {packages.map(pkg => {
        const week = currentWeek(pkg.created_at)
        const started = pkg.enrollments.filter(en => en.has_first).length
        const done = pkg.enrollments.filter(en => en.has_final).length
        const openSlots = Math.max(0, pkg.player_count - pkg.enrollments.length)
        const fillPct = pkg.player_count > 0
          ? Math.min(100, Math.round((pkg.enrollments.length / pkg.player_count) * 100))
          : 0
        const donePct = pkg.player_count > 0
          ? Math.min(100, Math.round((done / pkg.player_count) * 100))
          : 0
        const isEnrollOpen = enrollOpen === pkg.id
        const isBoardOpen = boardOpen === pkg.id

        // Board is just the roster re-sorted — no extra request needed.
        const board = [...pkg.enrollments]
          .filter(en => en.has_first)
          .sort((a, b) => {
            const av = Number(a.display_final_score ?? a.first_score ?? 0)
            const bv = Number(b.display_final_score ?? b.first_score ?? 0)
            return bv - av
          })

        return (
          <section key={pkg.id} className="border border-gray-200 rounded-2xl overflow-hidden bg-white">
            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-bold text-gray-900">
                    {pkg.teamName || '10-Week Shooting Development Program'}
                  </h3>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                      pkg.status === 'active'
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}
                  >
                    {pkg.status === 'active' ? 'Active' : pkg.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {pkg.player_count} player{pkg.player_count !== 1 ? 's' : ''} · started{' '}
                  {new Date(pkg.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <a
                href={`/org/curriculum/${pkg.id}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                <BookOpenIcon className="w-4 h-4" aria-hidden />
                Coach guide
              </a>
            </div>

            {/* ── Week tracker ───────────────────────────────────────── */}
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Program timeline</p>
                <p className="text-xs text-gray-500">
                  Week <span className="font-bold text-gray-900 tabular-nums">{week}</span> of {TOTAL_WEEKS}
                </p>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map(n => (
                  <div key={n} className="flex-1 min-w-0" title={`Week ${n}`}>
                    <div
                      className={`h-1.5 rounded-full ${
                        n < week ? 'bg-orange-300' : n === week ? 'bg-orange-500' : 'bg-gray-200'
                      }`}
                    />
                    <p className={`mt-1 text-[10px] text-center tabular-nums ${n === week ? 'font-bold text-orange-600' : 'text-gray-400'}`}>
                      {n}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Week 1 and Week 10 are the two filmed analyses — everything in between is coaching.
              </p>
            </div>

            {/* ── Stats ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-gray-100 border-b border-gray-100">
              {[
                { label: 'Enrolled', value: `${pkg.enrollments.length}/${pkg.player_count}`, sub: openSlots > 0 ? `${openSlots} slot${openSlots !== 1 ? 's' : ''} open` : 'Full' },
                { label: 'Baseline filmed', value: started, sub: 'Week 1 analysis' },
                { label: 'Completed', value: done, sub: 'Certificate ready' },
                { label: 'Credits left', value: pkg.teamCredits ?? '—', sub: 'on the class team' },
              ].map(s => (
                <div key={s.label} className="px-5 py-3">
                  <p className="text-xs font-medium text-gray-500">{s.label}</p>
                  <p className="text-xl font-bold text-gray-900 tabular-nums mt-0.5">{s.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>

            {/* ── Progress bars ──────────────────────────────────────── */}
            <div className="px-5 py-4 border-b border-gray-100 space-y-3">
              {[
                { label: 'Roster filled', pct: fillPct, bar: 'bg-gray-900' },
                { label: 'Players finished', pct: donePct, bar: 'bg-orange-500' },
              ].map(p => (
                <div key={p.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-gray-600">{p.label}</span>
                    <span className="font-semibold text-gray-900 tabular-nums">{p.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full rounded-full ${p.bar}`} style={{ width: `${p.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* ── Join code ──────────────────────────────────────────── */}
            {pkg.team_access_code && (
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Player join code</p>
                  <p className="text-xl font-bold font-mono tracking-widest text-gray-900 mt-0.5">{pkg.team_access_code}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Up to {pkg.player_count} players can join this class team with the link.
                  </p>
                </div>
                <button
                  onClick={() => copyJoinLink(pkg)}
                  className="shrink-0 text-sm font-semibold text-gray-700 border border-gray-300 hover:border-gray-400 hover:bg-gray-50 px-4 py-2 rounded-xl transition-colors"
                >
                  {copied === pkg.id ? 'Copied' : 'Copy signup link'}
                </button>
              </div>
            )}

            {/* ── Roster ─────────────────────────────────────────────── */}
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Roster ({pkg.enrollments.length})
                </p>
                <div className="flex items-center gap-3">
                  {done > 0 && (
                    <Link
                      href={`/org/class/${pkg.id}/certificates`}
                      target="_blank"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900 transition-colors"
                    >
                      <PrinterIcon className="w-3.5 h-3.5" aria-hidden />
                      Print certificates ({done})
                    </Link>
                  )}
                  {board.length > 0 && (
                    <button
                      onClick={() => setBoardOpen(isBoardOpen ? null : pkg.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900 transition-colors"
                    >
                      <TrophyIcon className="w-3.5 h-3.5" aria-hidden />
                      {isBoardOpen ? 'Hide standings' : 'Standings'}
                    </button>
                  )}
                  {canManage && openSlots > 0 && (
                    <button
                      onClick={() => {
                        setEnrollOpen(isEnrollOpen ? null : pkg.id)
                        setEnrollError('')
                        setEnrollSuccess(false)
                      }}
                      className="text-xs font-semibold text-orange-600 hover:text-orange-500 transition-colors"
                    >
                      {isEnrollOpen ? 'Cancel' : 'Add player'}
                    </button>
                  )}
                </div>
              </div>

              {canManage && isEnrollOpen && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                  <p className="text-xs text-gray-500">
                    Adds a roster spot for a player without an account. Players who sign up with the join code
                    appear here automatically.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <input
                      type="text"
                      placeholder="First name"
                      value={enrollFirstName}
                      onChange={e => setEnrollFirstName(e.target.value)}
                      className="flex-1 min-w-[10rem] bg-white border border-gray-300 rounded-xl px-3 py-2 text-sm text-black focus:outline-none focus:border-orange-500"
                    />
                    <input
                      type="text"
                      placeholder="Last initial"
                      value={enrollLastInit}
                      onChange={e => setEnrollLastInit(e.target.value)}
                      className="w-28 bg-white border border-gray-300 rounded-xl px-3 py-2 text-sm text-black focus:outline-none focus:border-orange-500"
                    />
                    <button
                      onClick={() => handleEnroll(pkg.id)}
                      disabled={enrolling}
                      className="bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                    >
                      {enrolling ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                  {enrollError && <p className="text-red-500 text-sm">{enrollError}</p>}
                  {enrollSuccess && <p className="text-green-600 text-sm font-medium">Player added to the roster.</p>}
                </div>
              )}

              {pkg.enrollments.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                  <p className="text-sm font-semibold text-gray-500">No players enrolled yet</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Share the join code above, or add players by name.
                  </p>
                </div>
              ) : (
                <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 overflow-hidden">
                  {pkg.enrollments.map(en => {
                    const name = playerName(en)
                    const startScore = en.first_score != null ? Number(en.first_score).toFixed(1) : null
                    const finalScore = en.display_final_score != null ? Number(en.display_final_score).toFixed(1) : null
                    const gain = startScore != null && finalScore != null
                      ? (Number(finalScore) - Number(startScore)).toFixed(1)
                      : null
                    return (
                      <div key={en.id} className="flex items-center gap-3 px-3 py-2.5 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {!en.has_first && 'Baseline not filmed'}
                            {en.has_first && !en.has_final && `Baseline ${startScore} — final not filmed`}
                            {en.has_final && (
                              <>
                                {startScore} → <span className="font-semibold text-gray-600">{finalScore}</span>
                                {gain && Number(gain) > 0 && <span className="text-green-600 font-semibold"> (+{gain})</span>}
                              </>
                            )}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                            en.has_final
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : en.has_first
                                ? 'bg-orange-50 text-orange-700 border-orange-200'
                                : 'bg-gray-50 text-gray-500 border-gray-200'
                          }`}
                        >
                          {en.has_final ? 'Complete' : en.has_first ? 'In progress' : 'Not started'}
                        </span>
                        {en.has_final && (
                          <Link
                            href={`/org/certificate/${en.id}`}
                            target="_blank"
                            className="shrink-0 text-xs font-semibold text-gray-700 hover:text-gray-900 transition-colors"
                          >
                            Certificate
                          </Link>
                        )}
                        {canManage && (en.has_first || en.has_final) && (
                          <button
                            onClick={() => resetEnrollment(en.id, name)}
                            disabled={resetting === en.id}
                            title="Clear first/final progress so the next upload counts as their first again"
                            className="shrink-0 text-xs font-semibold text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                          >
                            {resetting === en.id ? '…' : 'Reset'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {isBoardOpen && board.length > 0 && (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Class standings</p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {board.map((en, i) => {
                      const score = en.display_final_score ?? en.first_score
                      const gain = en.first_score != null && en.display_final_score != null
                        ? (Number(en.display_final_score) - Number(en.first_score)).toFixed(1)
                        : null
                      return (
                        <div key={en.id} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="w-6 text-center text-sm font-bold text-gray-300 tabular-nums">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{playerName(en)}</p>
                            {gain && Number(gain) > 0 && (
                              <p className="text-xs text-green-600 font-medium">+{gain} since Week 1</p>
                            )}
                          </div>
                          {score != null && (
                            <span className="text-base font-bold text-gray-900 tabular-nums">
                              {Number(score).toFixed(1)}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        )
      })}

      {onStartAnother && (
        <button
          onClick={onStartAnother}
          className="w-full border border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 rounded-2xl px-5 py-4 text-left transition-colors"
        >
          <p className="text-sm font-semibold text-gray-900">Start another program package</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Runs a second group — each package creates its own class team, roster, and certificates.
          </p>
        </button>
      )}
    </div>
  )
}
