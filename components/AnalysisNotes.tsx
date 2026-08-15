'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AnalysisNoteView } from '@/lib/analysis-notes'

const MAX_BODY = 2000

/**
 * The "Notes" panel on a shot report. Shows every published note plus the
 * viewer's own private one, and gives whoever may write here a single editable
 * note with a visibility switch.
 *
 * Private is the default: a note must be published deliberately, so a player's
 * own jottings can never ride along when they share the link. Publishing is
 * the trainer's path — write up the shot, flip the switch, send the link.
 */
export default function AnalysisNotes({
  analysisId,
  notes,
  canWrite,
  shareUrl,
}: {
  analysisId: number
  notes: AnalysisNoteView[]
  canWrite: boolean
  shareUrl: string
}) {
  const router = useRouter()
  const mine = notes.find((n) => n.mine) ?? null
  const others = notes.filter((n) => !n.mine)

  const [open, setOpen] = useState(!!mine)
  const [body, setBody] = useState(mine?.body ?? '')
  const [isPublic, setIsPublic] = useState(mine?.isPublic ?? false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'copied'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/analysis-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId, body, isPublic }),
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
    if (!confirm('Delete your note?')) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/analysis-note', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not delete')
      setBody('')
      setIsPublic(false)
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setStatus('copied')
      setTimeout(() => setStatus('idle'), 3000)
    } catch {
      setError('Could not copy — select the address bar instead.')
    }
  }

  if (!canWrite && others.length === 0) return null

  return (
    <section className="bg-gray-50 border border-gray-200 rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-black font-black text-lg sm:text-xl">Notes</h2>
        {canWrite && !open && (
          <button
            onClick={() => setOpen(true)}
            className="bg-black hover:bg-gray-800 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors"
          >
            {mine ? 'Edit your note' : 'Add a note'}
          </button>
        )}
      </div>

      {others.map((n) => (
        <div key={n.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs font-bold text-gray-500">{n.authorLabel}</p>
          <p className="text-sm text-black leading-relaxed mt-1 whitespace-pre-wrap">{n.body}</p>
        </div>
      ))}

      {mine && !open && (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs font-bold text-gray-500">
            Your note{' '}
            <span className={mine.isPublic ? 'text-green-600' : 'text-gray-400'}>
              {mine.isPublic ? '· shared on this report' : '· private to you'}
            </span>
          </p>
          <p className="text-sm text-black leading-relaxed mt-1 whitespace-pre-wrap">{mine.body}</p>
        </div>
      )}

      {canWrite && open && (
        <div className="space-y-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
            rows={5}
            placeholder="What you were working on, what to fix next, or a message for the player."
            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
          />

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm text-black">
              Show this note on the report
              <span className="block text-xs text-gray-500 mt-0.5">
                {isPublic
                  ? 'Anyone who opens this link will see it — including the player you send it to.'
                  : 'Private: only you can see this, even if the link is shared.'}
              </span>
            </span>
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={save}
              disabled={saving || !body.trim()}
              className="bg-orange-500 hover:bg-red-600 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              {saving ? 'Saving…' : 'Save note'}
            </button>
            <button
              onClick={() => {
                setOpen(false)
                setBody(mine?.body ?? '')
                setIsPublic(mine?.isPublic ?? false)
                setError(null)
              }}
              className="text-sm font-semibold text-gray-500 hover:text-black transition-colors"
            >
              Cancel
            </button>
            {mine && (
              <button
                onClick={remove}
                disabled={saving}
                className="text-sm font-semibold text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors"
              >
                Delete
              </button>
            )}
            <span className="text-xs text-gray-400 ml-auto">
              {body.length}/{MAX_BODY}
            </span>
            {status === 'saved' && <span className="text-xs font-bold text-green-600">Saved ✓</span>}
          </div>

          {isPublic && (
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
              <span className="flex-1 min-w-0 text-xs font-mono text-gray-600 truncate">
                {shareUrl}
              </span>
              <button
                onClick={copyLink}
                className="shrink-0 text-sm font-semibold text-orange-500 hover:text-red-600 transition-colors"
              >
                {status === 'copied' ? 'Copied!' : 'Copy link'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
