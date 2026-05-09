'use client'

import { useEffect, useState } from 'react'

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
  scores: Score[]
}

export default function LearnModePage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [corrections, setCorrections] = useState<Record<number, { score: string; notes: string }>>({})
  const [saving, setSaving] = useState<number | null>(null)

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

  useEffect(() => { load() }, [])

  async function saveCorrection(scoreId: number) {
    const c = corrections[scoreId]
    if (!c?.score) return
    setSaving(scoreId)

    await fetch('/api/admin/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scoreId,
        adminScore: parseFloat(c.score),
        adminNotes: c.notes || null,
      }),
    })

    setSaving(null)
    await load()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">Learn Mode</h1>
        <p className="text-slate-400 text-sm mt-1">
          Correct the AI&apos;s scores to improve future analyses. Corrections are used as examples in the AI prompt.
        </p>
      </div>

      <div className="space-y-3">
        {submissions.length === 0 && (
          <p className="text-slate-500 text-sm">No analyses yet.</p>
        )}
        {submissions.map((s) => (
          <div key={s.id} className="bg-slate-800 rounded-xl border border-slate-700">
            <button
              className="w-full flex items-center justify-between px-5 py-4 text-left"
              onClick={() => {
                if (expanded === s.id) {
                  setExpanded(null)
                } else {
                  setExpanded(s.id)
                  if (!s.scores && s.analysis_id) loadScores(s.analysis_id, s.id)
                }
              }}
            >
              <div>
                <p className="text-white text-sm font-medium">{s.email || 'No email'}</p>
                <p className="text-slate-500 text-xs">{new Date(s.created_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-orange-400 font-bold text-sm">
                  {s.overall_score ? `${s.overall_score}/10` : '—'}
                </span>
                <span className="text-slate-400 text-lg">{expanded === s.id ? '▲' : '▼'}</span>
              </div>
            </button>

            {expanded === s.id && s.scores && (
              <div className="border-t border-slate-700 divide-y divide-slate-700/50">
                {s.scores.map((score) => (
                  <div key={score.id} className="px-5 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-white text-sm font-semibold">{score.criterion_name}</p>
                        <p className="text-slate-400 text-xs mt-1 leading-relaxed">{score.ai_reasoning}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-slate-500 text-xs">AI Score</p>
                        <p className="text-orange-400 font-bold">{score.ai_score}/10</p>
                        {score.admin_score !== null && (
                          <p className="text-green-400 text-xs">Corrected: {score.admin_score}/10</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="10"
                        step="0.5"
                        placeholder="Correct score (1-10)"
                        value={corrections[score.id]?.score ?? ''}
                        onChange={(e) =>
                          setCorrections((prev) => ({
                            ...prev,
                            [score.id]: { ...prev[score.id], score: e.target.value },
                          }))
                        }
                        className="w-36 bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500"
                      />
                      <input
                        type="text"
                        placeholder="Notes (optional)"
                        value={corrections[score.id]?.notes ?? ''}
                        onChange={(e) =>
                          setCorrections((prev) => ({
                            ...prev,
                            [score.id]: { ...prev[score.id], notes: e.target.value },
                          }))
                        }
                        className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500"
                      />
                      <button
                        disabled={saving === score.id}
                        onClick={() => saveCorrection(score.id)}
                        className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {saving === score.id ? '...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
