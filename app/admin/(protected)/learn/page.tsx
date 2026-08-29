'use client'

import { useEffect, useState } from 'react'
import CopyButton from '@/components/CopyButton'

interface Score {
  id: number
  ai_score: number
  ai_reasoning: string
  admin_score: number | null
  admin_notes: string | null
  criterion_name: string
}

interface Submission {
  id: string
  email: string
  created_at: string
  overall_score: number
  analysis_id: number
  frame_urls: string[] | null
  video_url: string | null
  token: string | null
  account_email: string | null
  account_nickname: string | null
  team_name: string | null
  player_first_name: string | null
  player_last_initial: string | null
  scores: Score[]
}

// Who made this submission: a player account, a coach uploading for a roster
// player, or a coach's own shot. Falls back to the legacy contact email.
function accountLabel(s: Submission): string {
  if (s.account_email) {
    return s.account_nickname ? `${s.account_nickname} — ${s.account_email}` : s.account_email
  }
  if (s.player_first_name) {
    const player = `${s.player_first_name} ${s.player_last_initial ?? ''}`.trim()
    return s.team_name ? `${player} — team: ${s.team_name}` : `${player} — team upload`
  }
  if (s.email) return `${s.email} (coach upload)`
  return 'No account'
}

/** The address behind that label, for the copy button. */
function accountEmail(s: Submission): string | null {
  return s.account_email ?? (s.email || null)
}


export default function LearnModePage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [corrections, setCorrections] = useState<Record<number, { score: string; notes: string }>>({})
  const [saving, setSaving] = useState<number | null>(null)
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null)

  function toggle(s: Submission) {
    if (expanded === s.id) {
      setExpanded(null)
      return
    }
    setExpanded(s.id)
    if (!s.scores && s.analysis_id) loadScores(s.analysis_id, s.id)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!lightbox) return
      if (e.key === 'Escape') setLightbox(null)
      if (e.key === 'ArrowLeft') setLightbox((l) => l && l.index > 0 ? { ...l, index: l.index - 1 } : l)
      if (e.key === 'ArrowRight') setLightbox((l) => l && l.index < l.urls.length - 1 ? { ...l, index: l.index + 1 } : l)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  async function load() {
    const res = await fetch('/api/admin/submissions')
    const data = await res.json()
    setSubmissions(data)
  }

  async function loadScores(analysisId: number, submissionId: string) {
    const res = await fetch(`/api/admin/scores?analysisId=${analysisId}`)
    const scores = await res.json()
    setSubmissions((prev) =>
      prev.map((s) => (s.id === submissionId ? { ...s, scores } : s))
    )
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [])

  async function saveCorrection(scoreId: number) {
    const c = corrections[scoreId]
    if (!c?.score && !c?.notes) return
    setSaving(scoreId)

    await fetch('/api/admin/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scoreId,
        adminScore: c.score ? parseFloat(c.score) : null,
        adminNotes: c.notes || null,
      }),
    })

    // Update just this score in local state — don't reload everything so the panel stays open
    setSubmissions((prev) =>
      prev.map((s) => ({
        ...s,
        scores: s.scores?.map((score) =>
          score.id === scoreId
            ? { ...score, admin_score: c.score ? parseFloat(c.score) : null, admin_notes: c.notes || null }
            : score
        ),
      }))
    )

    setSaving(null)
    setCorrections((prev) => {
      const next = { ...prev }
      delete next[scoreId]
      return next
    })
  }

  return (
    <div className="space-y-6">

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/95 z-50 flex flex-col"
          onClick={() => setLightbox(null)}
        >
          {/* Always-visible top bar */}
          <div className="flex items-center justify-between px-6 py-4 shrink-0" onClick={(e) => e.stopPropagation()}>
            <span className="text-gray-600 dark:text-zinc-400 text-sm">
              Frame {lightbox.index + 1} of {lightbox.urls.length}
            </span>
            <button
              onClick={() => setLightbox(null)}
              className="bg-white text-black font-bold text-sm px-5 py-2 rounded-full hover:bg-zinc-200"
            >
              ✕ Close
            </button>
          </div>

          {/* Image */}
          <div className="flex-1 flex items-center justify-center px-6 min-h-0" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightbox.urls[lightbox.index]}
              alt={`Frame ${lightbox.index + 1}`}
              className="max-w-4xl w-full max-h-full object-contain rounded-xl border border-gray-300 dark:border-zinc-700"
            />
          </div>

          {/* Nav buttons */}
          <div className="flex justify-center gap-3 px-6 py-5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              disabled={lightbox.index === 0}
              onClick={() => setLightbox((l) => l && { ...l, index: l.index - 1 })}
              className="bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 disabled:opacity-30 text-black dark:text-white px-6 py-2.5 rounded-lg text-sm font-bold"
            >
              ← Prev
            </button>
            <button
              disabled={lightbox.index === lightbox.urls.length - 1}
              onClick={() => setLightbox((l) => l && { ...l, index: l.index + 1 })}
              className="bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 disabled:opacity-30 text-black dark:text-white px-6 py-2.5 rounded-lg text-sm font-bold"
            >
              Next →
            </button>
          </div>
        </div>
      )}
      <div>
        <h1 className="text-2xl font-black text-black dark:text-white">Learn Mode</h1>
        <p className="text-black dark:text-white text-sm mt-1">
          View the frames the AI analyzed, then correct its scores. Every correction improves future analyses.
        </p>
      </div>

      <div className="space-y-3">
        {submissions.length === 0 && (
          <p className="text-black dark:text-white text-sm">No analyses yet.</p>
        )}
        {submissions.map((s) => (
          <div key={s.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800">
            {/* A div, not a button: text inside a button can't be dragged over
                to select it, which made the email here impossible to copy. */}
            <div
              role="button"
              tabIndex={0}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left cursor-pointer"
              onClick={() => toggle(s)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggle(s)
                }
              }}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className="text-black dark:text-white text-sm font-medium select-text cursor-text break-all"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {accountLabel(s)}
                  </p>
                  {accountEmail(s) && <CopyButton value={accountEmail(s)!} label="Copy email" />}
                </div>
                <p
                  className="text-black dark:text-white text-xs select-text cursor-text"
                  onClick={(e) => e.stopPropagation()}
                >
                  {new Date(s.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-orange-400 font-bold text-sm">
                  {s.overall_score ? `${s.overall_score}/10` : '—'}
                </span>
                <span className="text-black dark:text-white text-lg">{expanded === s.id ? '▲' : '▼'}</span>
              </div>
            </div>

            {expanded === s.id && (
              <div className="border-t border-gray-200 dark:border-zinc-800">

                {/* Frames + the original video side by side, mirroring the
                    "Your shot" section at the bottom of a results page — the
                    frames show what the grader actually saw, the video shows
                    what really happened. */}
                {((s.frame_urls && s.frame_urls.length > 0) || s.video_url) && (
                  <div className="px-5 py-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-black dark:text-white text-xs font-semibold uppercase tracking-wider">
                        {s.frame_urls?.length
                          ? `Frames Analyzed (${s.frame_urls.length})`
                          : 'Uploaded video'}
                      </p>
                      {s.token && (
                        <a
                          href={`/results/${s.token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold text-orange-400 hover:text-orange-300"
                        >
                          Open the player&apos;s report ↗
                        </a>
                      )}
                    </div>
                    <div
                      className={
                        s.video_url && s.frame_urls?.length
                          ? 'grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start'
                          : ''
                      }
                    >
                      {s.frame_urls && s.frame_urls.length > 0 && (
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                          {s.frame_urls.map((url, i) => (
                            <div
                              key={i}
                              className="relative cursor-pointer group"
                              onClick={() => setLightbox({ urls: s.frame_urls!, index: i })}
                            >
                              <img
                                src={url}
                                alt={`Frame ${i + 1}`}
                                className="rounded-lg w-full aspect-video object-cover border border-gray-300 dark:border-zinc-700 group-hover:border-orange-400 transition-colors"
                              />
                              <span className="absolute bottom-1 left-1 text-black dark:text-white text-xs bg-black/60 rounded px-1">
                                {i + 1}
                              </span>
                              <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center">
                                <span className="opacity-0 group-hover:opacity-100 text-black dark:text-white text-lg">🔍</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {s.video_url && (
                        <video
                          src={s.video_url}
                          poster={s.frame_urls?.[Math.floor((s.frame_urls.length ?? 0) / 2)]}
                          controls
                          playsInline
                          preload="metadata"
                          className="w-full rounded-xl bg-white dark:bg-black border border-gray-300 dark:border-zinc-700"
                        />
                      )}
                    </div>
                    {!s.video_url && (
                      <p className="text-gray-500 dark:text-zinc-500 text-xs">
                        No video stored for this shot — originals over 100MB are analyzed from
                        frames only.
                      </p>
                    )}
                  </div>
                )}

                {/* Scores */}
                {s.scores ? (
                  <div className="divide-y divide-zinc-800/50">
                    {s.scores.map((score) => (
                      <div key={score.id} className="px-5 py-4 space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="text-black dark:text-white text-sm font-semibold">{score.criterion_name}</p>
                            <p className="text-black dark:text-white text-xs mt-1 leading-relaxed">{score.ai_reasoning}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-black dark:text-white text-xs">AI Score</p>
                            <p className="text-orange-400 font-bold">{score.ai_score}/10</p>
                            {score.admin_score !== null && (
                              <p className="text-orange-500 text-xs mt-1">✓ Corrected: {score.admin_score}/10</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            max="10"
                            step="0.5"
                            aria-label="Your score (1-10)"
                            placeholder="Your score (1-10)"
                            value={corrections[score.id]?.score ?? ''}
                            onChange={(e) =>
                              setCorrections((prev) => ({
                                ...prev,
                                [score.id]: { ...prev[score.id], score: e.target.value },
                              }))
                            }
                            className="w-36 bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-black dark:text-white text-sm focus:outline-none focus:border-orange-500"
                          />
                          <input
                            type="text"
                            aria-label="Notes — what did you see? (optional)"
                            placeholder="Notes — what did you see? (optional)"
                            value={corrections[score.id]?.notes ?? ''}
                            onChange={(e) =>
                              setCorrections((prev) => ({
                                ...prev,
                                [score.id]: { ...prev[score.id], notes: e.target.value },
                              }))
                            }
                            className="flex-1 bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-black dark:text-white text-sm focus:outline-none focus:border-orange-500"
                          />
                          <button
                            disabled={saving === score.id || (!corrections[score.id]?.score && !corrections[score.id]?.notes)}
                            onClick={() => saveCorrection(score.id)}
                            className="bg-orange-500 hover:bg-red-600 disabled:opacity-50 text-ink-950 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            {saving === score.id ? '...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-5 py-4">
                    <p className="text-black dark:text-white text-sm">Loading scores...</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
