'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const MAX_NOTE = 500

// 0 to 10 on the half point, matching the rubric's scale. A <select> rather
// than a number input so a coach cannot enter 7.25, which DECIMAL(4,1) would
// silently round on the way into the database.
const SCORE_OPTIONS = Array.from({ length: 21 }, (_, i) => i / 2)

/**
 * Writes one Coach's Note. Shared by the coach shot page and the admin
 * submission page — only `endpoint` differs, so both surfaces stay in sync.
 */
export default function CoachNoteEditor({
  criterionScoreId,
  aiScore,
  endpoint,
  initial,
  theme = 'light',
}: {
  criterionScoreId: number
  aiScore: number | null
  endpoint: string
  initial: { suggestedScore: number | null; note: string | null } | null
  theme?: 'light' | 'dark'
}) {
  const router = useRouter()
  const [score, setScore] = useState<string>(
    initial?.suggestedScore != null ? String(initial.suggestedScore) : '',
  )
  const [note, setNote] = useState(initial?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  const hasExisting = !!initial

  const dark = theme === 'dark'
  const field = dark
    ? 'bg-zinc-950 border-zinc-700 text-white'
    : 'bg-white border-gray-300 text-black'
  const label = dark ? 'text-zinc-400' : 'text-gray-500'

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          criterionScoreId,
          suggestedScore: score === '' ? null : Number(score),
          note: note.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Save failed (HTTP ${res.status})`)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 3000)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirm('Remove your note from this criterion? The player will no longer see it.')) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criterionScoreId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Remove failed (HTTP ${res.status})`)
      setScore('')
      setNote('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const empty = score === '' && !note.trim()

  return (
    <div className={`mt-3 rounded-xl border p-3 space-y-2 ${dark ? 'border-zinc-800 bg-zinc-900' : 'border-indigo-200 bg-indigo-50/60'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label className={`text-xs font-semibold ${label}`}>
          Your score
          <select
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className={`ml-2 rounded-lg border px-2 py-1 text-sm ${field}`}
          >
            <option value="">— none —</option>
            {SCORE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.toFixed(1)}
              </option>
            ))}
          </select>
        </label>
        <span className={`text-xs ${label}`}>
          {aiScore === null ? 'AI left this ungraded' : `AI said ${aiScore.toFixed(1)}`}
        </span>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
        rows={2}
        placeholder="What you saw — e.g. the camera missed it, but his elbow was tucked in person."
        className={`w-full rounded-lg border px-3 py-2 text-sm ${field}`}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={saving || empty}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-3 py-1.5 text-sm font-bold text-white transition-colors"
        >
          {saving ? 'Saving…' : hasExisting ? 'Update note' : 'Save note'}
        </button>
        {hasExisting && (
          <button
            onClick={remove}
            disabled={saving}
            className={`text-xs font-semibold ${label} hover:text-red-500 disabled:opacity-40 transition-colors`}
          >
            Remove
          </button>
        )}
        <span className={`text-xs ${label} ml-auto`}>
          {note.length}/{MAX_NOTE}
        </span>
        {status === 'saved' && <span className="text-xs font-bold text-green-500">Saved ✓</span>}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
