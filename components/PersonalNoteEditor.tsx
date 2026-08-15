'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const MAX_BODY = 2000

/**
 * One person's own note on a single criterion.
 *
 * Private by default so a player's jottings never ride along when they share
 * the link; publishing is a deliberate tick, and it's the trainer's path —
 * write up the criterion, show it on the report, send the link.
 */
export default function PersonalNoteEditor({
  criterionScoreId,
  initial,
}: {
  criterionScoreId: number
  initial: { body: string; isPublic: boolean } | null
}) {
  const router = useRouter()
  const [body, setBody] = useState(initial?.body ?? '')
  const [isPublic, setIsPublic] = useState(initial?.isPublic ?? false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/analysis-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criterionScoreId, body, isPublic }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Save failed (HTTP ${res.status})`)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirm('Delete your note on this criterion?')) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/analysis-note', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criterionScoreId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not delete')
      setBody('')
      setIsPublic(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
        rows={3}
        placeholder="What you were working on, or a message for the player."
        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
      />
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-xs text-gray-600">
          Show on this report
          <span className="block text-[11px] text-gray-400">
            {isPublic
              ? 'Anyone opening this link will see it.'
              : 'Private — only you, even if the link is shared.'}
          </span>
        </span>
      </label>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !body.trim()}
          className="bg-black hover:bg-gray-800 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {initial && (
          <button
            onClick={remove}
            disabled={saving}
            className="text-xs font-semibold text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors"
          >
            Delete
          </button>
        )}
        <span className="text-[11px] text-gray-400 ml-auto">
          {body.length}/{MAX_BODY}
        </span>
        {saved && <span className="text-xs font-bold text-green-600">Saved ✓</span>}
      </div>
    </div>
  )
}
