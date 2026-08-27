'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import CopyButton from '@/components/CopyButton'

interface PendingNote {
  id: number
  suggested_score: string | null
  note: string | null
  author_type: 'coach' | 'admin'
  author_email: string
  created_at: string
  criterion_score_id: number
  ai_score: string | null
  ai_reasoning: string
  admin_score: string | null
  criterion_name: string
  team_name: string | null
  submission_token: string
  frame_urls: string[] | null
  existing_corrections: number
  existing_drift: string | null
}

export default function CoachNotesQueuePage() {
  const [notes, setNotes] = useState<PendingNote[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The owner's own score/notes per pending row — deliberately NOT prefilled
  // from the coach's words (see the API route for why).
  const [drafts, setDrafts] = useState<Record<number, { score: string; notes: string }>>({})

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/coach-notes')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setNotes(data.notes)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [])

  async function review(id: number, action: 'accept' | 'reject') {
    const draft = drafts[id]
    if (action === 'accept' && !draft?.score) {
      setError('Enter your own score before accepting.')
      return
    }
    setBusy(id)
    setError(null)
    try {
      const res = await fetch('/api/admin/coach-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteId: id,
          action,
          adminScore: draft?.score ? Number(draft.score) : undefined,
          adminNotes: draft?.notes || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setNotes((ns) => ns.filter((n) => n.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6 text-white">
      <div>
        <h1 className="text-2xl font-black">Coach&apos;s Notes — review queue</h1>
        <p className="text-sm text-zinc-400 mt-1 max-w-3xl">
          Notes coaches (and you) have added to players&apos; reports. They are already visible to
          the player and have <strong className="text-zinc-300">no effect on grading</strong>.
          Accepting one writes your own correction into Learn Mode, which is what actually teaches
          the AI — so accept only when you agree, and use your own words.
        </p>
        <Link href="/admin/learn" className="inline-block mt-2 text-sm text-orange-400 hover:underline">
          ← Back to Learn Mode
        </Link>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading && <p className="text-sm text-zinc-400">Loading…</p>}
      {!loading && notes.length === 0 && (
        <p className="text-sm text-zinc-400">Nothing pending — every coach note has been reviewed.</p>
      )}

      <div className="space-y-4">
        {notes.map((n) => {
          const ai = n.ai_score === null ? null : Number(n.ai_score)
          const suggested = n.suggested_score === null ? null : Number(n.suggested_score)
          const draft = drafts[n.id] ?? { score: '', notes: '' }
          return (
            <div key={n.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold">{n.criterion_name}</span>
                <span className="text-xs text-zinc-400">
                  AI {ai === null ? 'not graded' : ai.toFixed(1)}
                  {suggested !== null && (
                    <> · <span className="text-indigo-400 font-bold">Coach {suggested.toFixed(1)}</span></>
                  )}
                </span>
                <span className="text-xs text-zinc-500 select-text">
                  {n.author_type === 'admin' ? 'you' : n.author_email}
                  {n.team_name ? ` · ${n.team_name}` : ''}
                </span>
                {n.author_type !== 'admin' && n.author_email && (
                  <CopyButton value={n.author_email} label="Copy email" />
                )}
                <Link
                  href={`/admin/submissions/${n.submission_token}`}
                  className="text-xs text-orange-400 hover:underline ml-auto"
                >
                  Open submission →
                </Link>
              </div>

              {n.note && (
                <div className="rounded-lg border border-indigo-900/60 bg-indigo-950/40 px-3 py-2">
                  <p className="text-xs font-bold text-indigo-300 mb-1">Coach wrote</p>
                  <p className="text-sm text-indigo-100">{n.note}</p>
                </div>
              )}

              <details className="text-xs text-zinc-400">
                <summary className="cursor-pointer select-none">What the AI said</summary>
                <p className="mt-1 leading-relaxed">{n.ai_reasoning}</p>
              </details>

              {n.frame_urls && n.frame_urls.length > 0 && (
                <div className="grid grid-cols-6 gap-1.5">
                  {n.frame_urls.slice(0, 12).map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="rounded w-full aspect-video object-cover border border-zinc-800" />
                    </a>
                  ))}
                </div>
              )}

              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2">
                <p className="text-xs text-zinc-400">
                  Your correction — this is what trains the AI.{' '}
                  <span className="text-zinc-500">
                    {n.existing_corrections > 0
                      ? `${n.existing_corrections} correction${n.existing_corrections === 1 ? '' : 's'} already on this criterion${n.existing_drift ? `, averaging ${Number(n.existing_drift) > 0 ? '+' : ''}${Number(n.existing_drift).toFixed(1)}` : ''}.`
                      : 'No corrections on this criterion yet — this would be the first.'}
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number" min="0" max="10" step="0.5"
                    aria-label="Your score"
                    placeholder="Your score"
                    value={draft.score}
                    onChange={(e) => setDrafts((d) => ({ ...d, [n.id]: { ...draft, score: e.target.value } }))}
                    className="w-28 rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-sm"
                  />
                  <input
                    type="text"
                    aria-label="Your notes, in your own words"
                    placeholder="Your notes, in your own words"
                    value={draft.notes}
                    onChange={(e) => setDrafts((d) => ({ ...d, [n.id]: { ...draft, notes: e.target.value } }))}
                    className="flex-1 min-w-48 rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => review(n.id, 'accept')}
                    disabled={busy === n.id}
                    className="rounded-lg bg-orange-500 hover:bg-red-600 disabled:opacity-40 px-3 py-1.5 text-sm font-bold"
                  >
                    {busy === n.id ? '…' : 'Accept — teach the AI'}
                  </button>
                  <button
                    onClick={() => review(n.id, 'reject')}
                    disabled={busy === n.id}
                    className="rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 px-3 py-1.5 text-sm"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
