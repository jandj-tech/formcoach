'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { copyToClipboard } from '@/lib/copy'
import { backendButton } from '@/components/backend/button-styles'
import { BookOpenIcon, PrinterIcon, TrophyIcon } from 'lucide-react'

export interface ClassManagerEnrollment {
  id: string
  first_name: string | null
  last_name_initial: string | null
  first_score: number | null
  display_final_score: number | null
  has_first: boolean
  has_final: boolean
}

export interface ClassManagerPackage {
  id: string
  player_count: number
  status: string
  created_at: string
  team_access_code: string | null
  enrollments: ClassManagerEnrollment[]
  /** Present when the caller knows which team runs this package. */
  teamName?: string | null
  teamCredits?: number | null
}

interface Props {
  packages: ClassManagerPackage[]
  /** The org owner and the class team's coach both manage the same program. */
  canManage?: boolean
  /** Org-only: reveal the buy form for a second package. */
  onStartAnother?: () => void
}

const TOTAL_WEEKS = 10

function playerName(en: Pick<ClassManagerEnrollment, 'first_name' | 'last_name_initial'>) {
  return `${en.first_name || 'Player'}${en.last_name_initial ? ' ' + en.last_name_initial + '.' : ''}`
}

/** Week 1 is the week of purchase; clamp so a finished class reads as week 10. */
function currentWeek(createdAt: string): number {
  const started = new Date(createdAt).getTime()
  if (Number.isNaN(started)) return 1
  const weeks = Math.floor((Date.now() - started) / (7 * 24 * 60 * 60 * 1000)) + 1
  return Math.min(Math.max(weeks, 1), TOTAL_WEEKS)
}

const CARD = 'border border-gray-200 dark:border-courtline rounded-2xl overflow-hidden bg-white dark:bg-ink-900'
const DIVIDE = 'border-b border-gray-100 dark:border-courtline/60'
const LABEL = 'text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-chalk-dim'

export default function ClassManager({ packages, canManage = false, onStartAnother }: Props) {
  const router = useRouter()

  const [enrollOpen, setEnrollOpen] = useState<string | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastInit, setLastInit] = useState('')
  const [enrolling, setEnrolling] = useState(false)
  const [enrollError, setEnrollError] = useState('')
  const [enrollSuccess, setEnrollSuccess] = useState(false)
  const [resetting, setResetting] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [boardOpen, setBoardOpen] = useState<string | null>(null)

  async function handleEnroll(packageId: string) {
    if (!firstName.trim()) {
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
          firstName: firstName.trim(),
          lastNameInitial: lastInit.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setEnrollError(data.error || 'Could not add that player.')
        setEnrolling(false)
        return
      }
      setEnrollSuccess(true)
      setFirstName('')
      setLastInit('')
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
        alert(data.error || 'Could not reset that player.')
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
        const pct = (n: number) =>
          pkg.player_count > 0 ? Math.min(100, Math.round((n / pkg.player_count) * 100)) : 0
        const isEnrollOpen = enrollOpen === pkg.id
        const isBoardOpen = boardOpen === pkg.id

        // Standings are the roster re-sorted — no extra request needed.
        const board = pkg.enrollments
          .filter(en => en.has_first)
          .slice()
          .sort((a, b) =>
            Number(b.display_final_score ?? b.first_score ?? 0) -
            Number(a.display_final_score ?? a.first_score ?? 0),
          )

        return (
          <section key={pkg.id} className={CARD}>
            {/* ── Header ─────────────────────────────────────────── */}
            <div className={`px-5 py-4 ${DIVIDE} flex items-start justify-between gap-4 flex-wrap`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-black text-black dark:text-chalk">
                    {pkg.teamName || '10-Week Shooting Development Program'}
                  </h3>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                      pkg.status === 'active'
                        ? 'border-ember-500/40 text-ember-600 dark:text-ember-400 bg-ember-500/10'
                        : 'border-gray-200 dark:border-courtline text-gray-500 dark:text-chalk-dim'
                    }`}
                  >
                    {pkg.status === 'active' ? 'Active' : pkg.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-chalk-dim mt-0.5">
                  {pkg.player_count} place{pkg.player_count !== 1 ? 's' : ''} · started{' '}
                  {new Date(pkg.created_at).toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </p>
              </div>
              <a
                href={`/org/curriculum/${pkg.id}`}
                target="_blank"
                rel="noreferrer"
                className={backendButton('primary', 'shrink-0')}
              >
                <BookOpenIcon aria-hidden />
                Session plan
              </a>
            </div>

            {/* ── Week tracker ───────────────────────────────────── */}
            <div className={`px-5 py-4 ${DIVIDE}`}>
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <p className={LABEL}>Program timeline</p>
                <p className="text-xs text-gray-500 dark:text-chalk-dim">
                  Week <span className="font-black text-black dark:text-chalk tabular-nums">{week}</span> of {TOTAL_WEEKS}
                </p>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map(n => (
                  <div key={n} className="flex-1 min-w-0" title={`Week ${n}`}>
                    <div
                      className={`h-1.5 rounded-full ${
                        n < week
                          ? 'bg-ember-500/40'
                          : n === week
                            ? 'bg-ember-500'
                            : 'bg-gray-200 dark:bg-courtline'
                      }`}
                    />
                    <p
                      className={`mt-1 text-[10px] text-center tabular-nums ${
                        n === week
                          ? 'font-black text-ember-600 dark:text-ember-400'
                          : 'text-gray-400 dark:text-chalk-dim'
                      }`}
                    >
                      {n}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-chalk-dim mt-1.5">
                Weeks 1 and 10 are the two filmed analyses — everything between them is coaching.
              </p>
            </div>

            {/* ── Stats ──────────────────────────────────────────── */}
            <div className={`grid grid-cols-2 sm:grid-cols-4 ${DIVIDE}`}>
              {[
                {
                  label: 'Enrolled',
                  value: `${pkg.enrollments.length}/${pkg.player_count}`,
                  sub: openSlots > 0 ? `${openSlots} place${openSlots !== 1 ? 's' : ''} open` : 'Full',
                },
                { label: 'Baseline filmed', value: started, sub: 'Week 1 analysis' },
                { label: 'Finished', value: done, sub: 'certificate ready' },
                { label: 'Credits left', value: pkg.teamCredits ?? '—', sub: 'on the class team' },
              ].map(s => (
                <div
                  key={s.label}
                  className="px-5 py-3 border-r last:border-r-0 border-gray-100 dark:border-courtline/60"
                >
                  <p className="text-xs font-medium text-gray-500 dark:text-chalk-dim">{s.label}</p>
                  <p className="text-xl font-black text-black dark:text-chalk tabular-nums mt-0.5">{s.value}</p>
                  <p className="text-xs text-gray-400 dark:text-chalk-dim mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>

            {/* ── Progress ───────────────────────────────────────── */}
            <div className={`px-5 py-4 ${DIVIDE} space-y-3`}>
              {[
                { label: 'Roster filled', n: pkg.enrollments.length, bar: 'bg-black dark:bg-chalk' },
                { label: 'Players finished', n: done, bar: 'bg-ember-500' },
              ].map(p => (
                <div key={p.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-gray-600 dark:text-chalk-dim">{p.label}</span>
                    <span className="font-bold text-black dark:text-chalk tabular-nums">{pct(p.n)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-ink-800 overflow-hidden">
                    <div className={`h-full rounded-full ${p.bar}`} style={{ width: `${pct(p.n)}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* ── Join code ──────────────────────────────────────── */}
            {pkg.team_access_code && (
              <div className={`px-5 py-4 ${DIVIDE} flex items-center justify-between gap-4 flex-wrap`}>
                <div className="min-w-0">
                  <p className={LABEL}>Player join code</p>
                  <p className="text-xl font-black font-mono tracking-widest text-black dark:text-chalk mt-0.5">
                    {pkg.team_access_code}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-chalk-dim mt-0.5">
                    Up to {pkg.player_count} players can join the class team with this link.
                  </p>
                </div>
                <button onClick={() => copyJoinLink(pkg)} className={backendButton('quiet', 'shrink-0')}>
                  {copied === pkg.id ? 'Copied' : 'Copy signup link'}
                </button>
              </div>
            )}

            {/* ── Roster ─────────────────────────────────────────── */}
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className={LABEL}>Roster ({pkg.enrollments.length})</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {done > 0 && (
                    <Link
                      href={`/org/class/${pkg.id}/certificates`}
                      target="_blank"
                      className={backendButton('quiet')}
                    >
                      <PrinterIcon aria-hidden />
                      Certificates ({done})
                    </Link>
                  )}
                  {board.length > 0 && (
                    <button
                      onClick={() => setBoardOpen(isBoardOpen ? null : pkg.id)}
                      className={backendButton('quiet')}
                    >
                      <TrophyIcon aria-hidden />
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
                      className={backendButton('secondary')}
                    >
                      {isEnrollOpen ? 'Cancel' : 'Add player'}
                    </button>
                  )}
                </div>
              </div>

              {canManage && isEnrollOpen && (
                <div className="border border-gray-200 dark:border-courtline rounded-xl p-4 space-y-2">
                  <p className="text-xs text-gray-500 dark:text-chalk-dim">
                    Adds a place for a player without an account. Players who sign up with the join code
                    appear here on their own.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <input
                      type="text"
                      placeholder="First name"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      className="flex-1 min-w-[10rem] bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-3 py-2 text-sm text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors"
                    />
                    <input
                      type="text"
                      placeholder="Last initial"
                      value={lastInit}
                      onChange={e => setLastInit(e.target.value)}
                      className="w-28 bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-3 py-2 text-sm text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors"
                    />
                    <button
                      onClick={() => handleEnroll(pkg.id)}
                      disabled={enrolling}
                      className={backendButton('primary')}
                    >
                      {enrolling ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                  {enrollError && <p className="text-red-600 dark:text-red-400 text-sm">{enrollError}</p>}
                  {enrollSuccess && (
                    <p className="text-ember-600 dark:text-ember-400 text-sm font-bold">Added to the roster.</p>
                  )}
                </div>
              )}

              {pkg.enrollments.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-gray-200 dark:border-courtline rounded-xl">
                  <p className="text-sm font-bold text-gray-500 dark:text-chalk-dim">No players enrolled yet</p>
                  <p className="text-xs text-gray-400 dark:text-chalk-dim mt-1">
                    Share the join code above, or add players by name.
                  </p>
                </div>
              ) : (
                <div className="border border-gray-100 dark:border-courtline rounded-xl divide-y divide-gray-100 dark:divide-courtline/60 overflow-hidden">
                  {pkg.enrollments.map(en => {
                    const name = playerName(en)
                    const start = en.first_score != null ? Number(en.first_score).toFixed(1) : null
                    const final = en.display_final_score != null ? Number(en.display_final_score).toFixed(1) : null
                    const gain = start != null && final != null ? (Number(final) - Number(start)).toFixed(1) : null
                    return (
                      <div key={en.id} className="flex items-center gap-3 px-3 py-2.5 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-black dark:text-chalk truncate">{name}</p>
                          <p className="text-xs text-gray-400 dark:text-chalk-dim mt-0.5">
                            {!en.has_first && 'Baseline not filmed'}
                            {en.has_first && !en.has_final && `Baseline ${start} — final not filmed`}
                            {en.has_final && (
                              <>
                                {start} → <span className="font-bold text-gray-600 dark:text-chalk">{final}</span>
                                {gain && Number(gain) > 0 && (
                                  <span className="text-ember-600 dark:text-ember-400 font-bold"> (+{gain})</span>
                                )}
                              </>
                            )}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                            en.has_final
                              ? 'border-ember-500/40 text-ember-600 dark:text-ember-400 bg-ember-500/10'
                              : en.has_first
                                ? 'border-gray-300 dark:border-chalk-dim/40 text-gray-600 dark:text-chalk-dim'
                                : 'border-gray-200 dark:border-courtline text-gray-400 dark:text-chalk-dim'
                          }`}
                        >
                          {en.has_final ? 'Finished' : en.has_first ? 'In progress' : 'Not started'}
                        </span>
                        {en.has_final && (
                          <Link
                            href={`/org/certificate/${en.id}`}
                            target="_blank"
                            className="shrink-0 text-xs font-bold text-ember-600 dark:text-ember-400 hover:underline"
                          >
                            Certificate
                          </Link>
                        )}
                        {canManage && (en.has_first || en.has_final) && (
                          <button
                            onClick={() => resetEnrollment(en.id, name)}
                            disabled={resetting === en.id}
                            title="Clear first/final progress so the next upload counts as their first again"
                            className="shrink-0 text-xs font-bold text-gray-400 dark:text-chalk-dim hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
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
                <div className="border border-gray-100 dark:border-courtline rounded-xl overflow-hidden">
                  <div className="bg-gray-50 dark:bg-ink-800 px-4 py-2 border-b border-gray-100 dark:border-courtline">
                    <p className={LABEL}>Class standings</p>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-courtline/60">
                    {board.map((en, i) => {
                      const score = en.display_final_score ?? en.first_score
                      const gain =
                        en.first_score != null && en.display_final_score != null
                          ? (Number(en.display_final_score) - Number(en.first_score)).toFixed(1)
                          : null
                      return (
                        <div key={en.id} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="w-6 text-center text-sm font-black text-gray-300 dark:text-chalk-dim tabular-nums">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-black dark:text-chalk truncate">{playerName(en)}</p>
                            {gain && Number(gain) > 0 && (
                              <p className="text-xs text-ember-600 dark:text-ember-400 font-medium">
                                +{gain} since Week 1
                              </p>
                            )}
                          </div>
                          {score != null && (
                            <span className="text-base font-black text-black dark:text-chalk tabular-nums">
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
          className="w-full border border-dashed border-gray-300 dark:border-courtline hover:border-ember-500/50 rounded-2xl px-5 py-4 text-left transition-colors"
        >
          <p className="text-sm font-bold text-black dark:text-chalk">Start another program package</p>
          <p className="text-xs text-gray-500 dark:text-chalk-dim mt-0.5">
            Runs a second group — each package gets its own class team, roster and certificates.
          </p>
        </button>
      )}
    </div>
  )
}
