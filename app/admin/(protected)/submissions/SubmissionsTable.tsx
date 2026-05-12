'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export interface SubmissionRow {
  id: string
  email: string | null
  status: string
  token: string | null
  created_at: string
  overall_score: string | number | null
}

export default function SubmissionsTable({ submissions }: { submissions: SubmissionRow[] }) {
  const router = useRouter()
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllVisible = () => {
    if (selected.size === submissions.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(submissions.map((s) => s.id)))
    }
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  const runDelete = async (payload: { ids?: string[]; all?: boolean }, confirmMsg: string) => {
    if (!confirm(confirmMsg)) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/submissions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Delete failed')
      }
      exitSelectMode()
      startTransition(() => router.refresh())
    } catch (err) {
      alert('Could not delete: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  const clearSelected = () =>
    runDelete(
      { ids: Array.from(selected) },
      `Permanently delete ${selected.size} submission${selected.size === 1 ? '' : 's'}? This also removes the uploaded video and frames from Blob storage.`,
    )

  const clearAll = () =>
    runDelete(
      { all: true },
      `Permanently delete ALL ${submissions.length} submissions and every associated video/frame? This cannot be undone.`,
    )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-black text-white">All Submissions</h1>
        <div className="flex items-center gap-2">
          {!selectMode ? (
            <button
              onClick={() => setSelectMode(true)}
              disabled={submissions.length === 0}
              className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Clear
            </button>
          ) : (
            <>
              <button
                onClick={clearSelected}
                disabled={busy || selected.size === 0}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                Clear Selected ({selected.size})
              </button>
              <button
                onClick={clearAll}
                disabled={busy}
                className="bg-red-700 hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                Clear All
              </button>
              <button
                onClick={exitSelectMode}
                disabled={busy}
                className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-white text-xs">
              {selectMode && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.size > 0 && selected.size === submissions.length}
                    onChange={toggleAllVisible}
                    className="cursor-pointer"
                    aria-label="Select all"
                  />
                </th>
              )}
              <th className="text-left px-5 py-3">Email</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-left px-5 py-3">Score</th>
              <th className="text-left px-5 py-3">Date</th>
              <th className="text-left px-5 py-3">Results</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {submissions.length === 0 ? (
              <tr>
                <td colSpan={selectMode ? 6 : 5} className="px-5 py-6 text-white">
                  No submissions yet.
                </td>
              </tr>
            ) : (
              submissions.map((s) => {
                const isSelected = selected.has(s.id)
                return (
                  <tr
                    key={s.id}
                    className={`transition-colors ${isSelected ? 'bg-red-500/10' : 'hover:bg-zinc-800/30'}`}
                  >
                    {selectMode && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(s.id)}
                          className="cursor-pointer"
                          aria-label={`Select submission ${s.id}`}
                        />
                      </td>
                    )}
                    <td className="px-5 py-3 text-white">
                      {s.email || <span className="text-white">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          s.status === 'complete'
                            ? 'bg-green-500/10 text-orange-500'
                            : s.status === 'processing'
                              ? 'bg-yellow-500/10 text-orange-500'
                              : 'bg-red-500/10 text-red-400'
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-orange-400 font-bold">
                      {s.overall_score ? `${s.overall_score}/10` : '—'}
                    </td>
                    <td className="px-5 py-3 text-white text-xs">
                      {new Date(s.created_at).toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      {s.token ? (
                        <a
                          href={`/results/${s.token}`}
                          className="text-orange-400 hover:text-orange-300 text-xs underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-white text-xs">—</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
