'use client'

// Grading Test Bench — run the grader against pinned reference shots and see
// what changed, entirely from the admin UI. Mirrors the CLI in
// scripts/eval/run-eval.mjs; both share lib/eval-report.ts for the math and
// the eval_fixtures / eval_baselines tables for data.
import { useEffect, useState } from 'react'
import {
  aggregateRuns,
  checkAccuracy,
  countDrift,
  diffBaseline,
  toBaselineEntry,
  SPREAD_PASS,
  SPREAD_CLOSE,
  type BaselineEntry,
  type EvalExpected,
  type EvalGrader,
  type EvalRun,
  type EvalSummary,
} from '@/lib/eval-report'

interface Fixture {
  id: number
  slug: string
  analysis_id: number | null
  description: string | null
  expected: EvalExpected
  active: boolean
  frame_urls: string[]
}
interface Recent {
  id: number
  overall_score: number | string
  created_at: string
  thumb: string | null
  corrected: boolean
}
interface Baseline {
  id: number
  grader: EvalGrader | null
  results: Record<string, BaselineEntry>
  accepted_at: string
}
interface FixtureResult {
  summary?: EvalSummary
  accuracy?: string[]
  drift?: string[]
  error?: string
}

const FLAG_LABELS: Record<string, string> = {
  elbow_severely_out: 'Elbow severely out',
  followthrough_flick_to_side: 'Follow-through flick to side',
  arc_too_flat: 'Arc too flat',
  chest_pass_hands: 'Chest-pass hands',
}
const PLAYER_TYPES = ['child', 'recreational', 'college_pro', 'nba_bad_form', 'nba_decent', 'nba_elite']
const FULL_RUNS = 2

interface Draft {
  description: string
  overallLo: string
  overallHi: string
  criteria: Record<string, { mode: 'skip' | 'range' | 'null'; lo: string; hi: string }>
  flags: Record<string, 'skip' | 'yes' | 'no'>
  playerType: string
  noShot: boolean
}

function buildDraft(f: Fixture, criteriaNames: string[]): Draft {
  const e = f.expected ?? {}
  const criteria: Draft['criteria'] = {}
  for (const name of criteriaNames) {
    const exp = e.criteria?.[name]
    if (exp === 'null') criteria[name] = { mode: 'null', lo: '', hi: '' }
    else if (Array.isArray(exp)) criteria[name] = { mode: 'range', lo: String(exp[0]), hi: String(exp[1]) }
    else criteria[name] = { mode: 'skip', lo: '', hi: '' }
  }
  const flags: Draft['flags'] = {}
  for (const fn of Object.keys(FLAG_LABELS)) {
    const exp = e.flags?.[fn]
    flags[fn] = exp === true ? 'yes' : exp === false ? 'no' : 'skip'
  }
  return {
    description: f.description ?? '',
    overallLo: Array.isArray(e.overall) ? String(e.overall[0]) : '',
    overallHi: Array.isArray(e.overall) ? String(e.overall[1]) : '',
    criteria,
    flags,
    playerType: e.player_type ?? '',
    noShot: e.shot_detected === false,
  }
}

function draftToExpected(d: Draft): EvalExpected {
  if (d.noShot) return { shot_detected: false }
  const expected: EvalExpected = { shot_detected: true }
  const lo = parseFloat(d.overallLo)
  const hi = parseFloat(d.overallHi)
  if (!Number.isNaN(lo) && !Number.isNaN(hi)) expected.overall = [lo, hi]
  const criteria: NonNullable<EvalExpected['criteria']> = {}
  for (const [name, c] of Object.entries(d.criteria)) {
    if (c.mode === 'null') criteria[name] = 'null'
    else if (c.mode === 'range') {
      const clo = parseFloat(c.lo)
      const chi = parseFloat(c.hi)
      if (!Number.isNaN(clo) && !Number.isNaN(chi)) criteria[name] = [clo, chi]
    }
  }
  if (Object.keys(criteria).length > 0) expected.criteria = criteria
  const flags: NonNullable<EvalExpected['flags']> = {}
  for (const [fn, mode] of Object.entries(d.flags)) {
    if (mode === 'yes') flags[fn] = true
    else if (mode === 'no') flags[fn] = false
  }
  if (Object.keys(flags).length > 0) expected.flags = flags
  if (d.playerType) expected.player_type = d.playerType
  return expected
}

export default function EvalPage() {
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [recent, setRecent] = useState<Recent[]>([])
  const [baseline, setBaseline] = useState<Baseline | null>(null)
  const [criteriaNames, setCriteriaNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [expanded, setExpanded] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  const [manualId, setManualId] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<number | null>(null)

  const [running, setRunning] = useState<{ quick: boolean; done: number; total: number; current: string } | null>(null)
  const [results, setResults] = useState<Record<string, FixtureResult>>({})
  const [lastGrader, setLastGrader] = useState<EvalGrader | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null)

  // loading starts true; the effect only ever flips it false after the fetch
  // resolves (every setState here sits behind an await, per the
  // set-state-in-effect rule).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/eval/fixtures')
        if (!res.ok) throw new Error(`Failed to load (${res.status}) — has the database migration run?`)
        const data = await res.json()
        if (cancelled) return
        setFixtures(data.fixtures)
        setRecent(data.recent)
        setBaseline(data.baseline)
        setCriteriaNames(data.criteriaNames)
        setLoadError(null)
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function addFixture(analysisId: number) {
    setAddError(null)
    setAddingId(analysisId)
    try {
      const res = await fetch('/api/admin/eval/fixtures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId, slug: `shot-${analysisId}` }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add')
      setFixtures((f) => [...f, data.fixture].sort((a, b) => a.slug.localeCompare(b.slug)))
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err))
    } finally {
      setAddingId(null)
    }
  }

  async function saveDraft(fixture: Fixture) {
    if (!draft) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/eval/fixtures/${fixture.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected: draftToExpected(draft), description: draft.description }),
      })
      const data = await res.json()
      if (res.ok) {
        setFixtures((fs) => fs.map((f) => (f.id === fixture.id ? { ...f, ...data.fixture } : f)))
        setExpanded(null)
        setDraft(null)
      }
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(fixture: Fixture) {
    const res = await fetch(`/api/admin/eval/fixtures/${fixture.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !fixture.active }),
    })
    if (res.ok) setFixtures((fs) => fs.map((f) => (f.id === fixture.id ? { ...f, active: !fixture.active } : f)))
  }

  async function removeFixture(fixture: Fixture) {
    if (!confirm(`Delete reference shot "${fixture.slug}"? Its expected ranges are lost.`)) return
    const res = await fetch(`/api/admin/eval/fixtures/${fixture.id}`, { method: 'DELETE' })
    if (res.ok) setFixtures((fs) => fs.filter((f) => f.id !== fixture.id))
  }

  async function runEval(quick: boolean) {
    const active = fixtures.filter((f) => f.active)
    if (active.length === 0) return
    const runsPer = quick ? 1 : FULL_RUNS
    setResults({})
    setAcceptedAt(null)
    setRunning({ quick, done: 0, total: active.length * runsPer, current: active[0].slug })
    const collected: Record<string, FixtureResult> = {}
    let grader: EvalGrader | null = null
    let done = 0
    for (const fixture of active) {
      const runs: EvalRun[] = []
      let error: string | null = null
      for (let r = 0; r < runsPer; r++) {
        setRunning({ quick, done, total: active.length * runsPer, current: fixture.slug })
        try {
          const res = await fetch('/api/admin/eval/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: fixture.slug, quick }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || `Run failed (${res.status})`)
          runs.push(data.run)
        } catch (err) {
          error = err instanceof Error ? err.message : String(err)
          break
        }
        done++
      }
      if (error || runs.length === 0) {
        collected[fixture.slug] = { error: error ?? 'No runs completed' }
      } else {
        const summary = aggregateRuns(runs)
        grader = summary.grader ?? grader
        collected[fixture.slug] = {
          summary,
          accuracy: checkAccuracy(fixture.expected ?? {}, summary),
          drift: diffBaseline(baseline?.results?.[fixture.slug], summary),
        }
      }
      setResults({ ...collected })
      setLastGrader(grader)
    }
    setRunning(null)
  }

  async function acceptBaseline() {
    const entries = Object.entries(results).filter(([, r]) => r.summary)
    if (entries.length === 0) return
    setAccepting(true)
    try {
      const payload = Object.fromEntries(entries.map(([slug, r]) => [slug, toBaselineEntry(r.summary!)]))
      // A partial run must not drop the untouched fixtures from the baseline.
      const merged = { ...(baseline?.results ?? {}), ...payload }
      const res = await fetch('/api/admin/eval/baseline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grader: lastGrader, results: merged }),
      })
      const data = await res.json()
      if (res.ok) {
        setBaseline(data.baseline)
        setAcceptedAt(data.baseline.accepted_at)
      }
    } finally {
      setAccepting(false)
    }
  }

  const activeCount = fixtures.filter((f) => f.active).length
  const resultEntries = Object.entries(results)
  const totalAccuracyFails = resultEntries.reduce((n, [, r]) => n + (r.accuracy?.length ?? 0) + (r.error ? 1 : 0), 0)
  const totalDrift = resultEntries.reduce((n, [, r]) => n + countDrift(r.drift ?? []), 0)
  const graderChanged =
    !!lastGrader?.prompt_sha && !!baseline?.grader?.prompt_sha && lastGrader.prompt_sha !== baseline.grader.prompt_sha

  if (loading) return <p className="text-zinc-400">Loading…</p>
  if (loadError) return <p className="text-red-400">{loadError}</p>

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Grading Test Bench</h1>
        <p className="text-zinc-400 mt-1 max-w-2xl">
          Your reference shots with known correct grades. Before any grading change goes live — a rubric edit, or a
          batch of Learn Mode corrections — run a check here and see exactly what moved. Approve the result to make it
          the new baseline, or revert your change.
        </p>
      </div>

      {/* ---- Run panel ---- */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => runEval(true)}
            disabled={!!running || activeCount === 0}
            className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 font-medium"
          >
            Quick check
          </button>
          <button
            onClick={() => runEval(false)}
            disabled={!!running || activeCount === 0}
            className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-red-600 disabled:opacity-40 font-medium"
          >
            Full eval
          </button>
          <span className="text-sm text-zinc-500">
            {activeCount} reference shot{activeCount === 1 ? '' : 's'} · quick ≈ 15¢/shot, one grading each · full ≈
            55¢/shot, {FULL_RUNS} gradings each to measure consistency
          </span>
        </div>
        {baseline && (
          <p className="text-sm text-zinc-500">
            Current baseline approved {new Date(baseline.accepted_at).toLocaleString()}
            {baseline.grader?.rubric_tags?.length ? ` · ${baseline.grader.rubric_tags.join(', ')}` : ''}
          </p>
        )}
        {!baseline && (
          <p className="text-sm text-amber-400">
            No baseline approved yet — run a full eval and approve it to freeze your starting point.
          </p>
        )}
        {running && (
          <div>
            <div className="flex justify-between text-sm text-zinc-400 mb-1">
              <span>
                Grading “{running.current}”… ({running.done}/{running.total} gradings done)
              </span>
              <span>each grading can take 1–3 minutes — keep this tab open</span>
            </div>
            <div className="h-2 rounded bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-orange-500 transition-all"
                style={{ width: `${Math.max(4, (running.done / running.total) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ---- Grader changed banner ---- */}
      {graderChanged && (
        <div className="rounded-xl border border-amber-600/50 bg-amber-950/40 p-4 text-amber-300 text-sm">
          <strong>The grader has changed since the approved baseline</strong> — a rubric edit or new Learn Mode
          corrections altered its instructions. Any drift below is the measured effect of that change: approve it if
          it&apos;s what you wanted, or revisit the change.
        </div>
      )}

      {/* ---- Results ---- */}
      {resultEntries.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              Results — {totalAccuracyFails === 0 && totalDrift === 0 ? (
                <span className="text-green-400">all good</span>
              ) : (
                <span className="text-red-400">
                  {totalAccuracyFails} accuracy issue{totalAccuracyFails === 1 ? '' : 's'}, {totalDrift} drift
                  {totalDrift === 1 ? '' : 's'} vs baseline
                </span>
              )}
            </h2>
            <button
              onClick={acceptBaseline}
              disabled={!!running || accepting || resultEntries.every(([, r]) => !r.summary)}
              className="px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-40 font-medium"
            >
              {accepting ? 'Approving…' : acceptedAt ? 'Approved ✓' : 'Approve as new baseline'}
            </button>
          </div>
          <div className="space-y-3">
            {resultEntries.map(([slug, r]) => (
              <div key={slug} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{slug}</span>
                  {r.error ? (
                    <span className="text-red-400 text-sm">✗ {r.error}</span>
                  ) : (
                    <>
                      <span className="text-sm text-zinc-400">
                        overall {r.summary!.shot_detected ? r.summary!.overall : 'no shot detected'}
                      </span>
                      {r.summary!.overall_spread !== null && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            r.summary!.overall_spread <= SPREAD_PASS
                              ? 'bg-green-900/60 text-green-300'
                              : r.summary!.overall_spread <= SPREAD_CLOSE
                                ? 'bg-amber-900/60 text-amber-300'
                                : 'bg-red-900/60 text-red-300'
                          }`}
                        >
                          consistency spread {r.summary!.overall_spread}
                        </span>
                      )}
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          r.accuracy!.length === 0 ? 'bg-green-900/60 text-green-300' : 'bg-red-900/60 text-red-300'
                        }`}
                      >
                        {r.accuracy!.length === 0 ? 'accuracy ✓' : `${r.accuracy!.length} accuracy issue${r.accuracy!.length === 1 ? '' : 's'}`}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          countDrift(r.drift!) === 0 ? 'bg-zinc-800 text-zinc-400' : 'bg-amber-900/60 text-amber-300'
                        }`}
                      >
                        {baseline ? (countDrift(r.drift!) === 0 ? 'no drift' : `${countDrift(r.drift!)} drift`) : 'no baseline yet'}
                      </span>
                    </>
                  )}
                </div>
                {!r.error && (r.accuracy!.length > 0 || r.drift!.length > 0 || r.summary!.consistency_issues.length > 0) && (
                  <ul className="mt-2 space-y-1 text-sm">
                    {r.accuracy!.map((line, i) => (
                      <li key={`a${i}`} className="text-red-400">
                        ✗ {line}
                      </li>
                    ))}
                    {r.drift!.map((line, i) => (
                      <li key={`d${i}`} className={line.includes('◀ DRIFT') ? 'text-amber-300' : 'text-zinc-400'}>
                        Δ {line}
                      </li>
                    ))}
                    {r.summary!.consistency_issues.map((line, i) => (
                      <li key={`c${i}`} className="text-zinc-500">
                        ⚠ {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Reference shots ---- */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
        <h2 className="text-lg font-semibold">Reference shots</h2>
        {fixtures.length === 0 && (
          <p className="text-zinc-500 text-sm">
            None yet. Add 8–10 from the list below — ideally shots you corrected in Learn Mode, covering the range: an
            excellent shot, a poor one, an elbow-out, a chest-pass, a kid, a blurry clip, and one video with no shot.
          </p>
        )}
        {fixtures.map((f) => (
          <div key={f.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex flex-wrap items-center gap-3">
              {f.frame_urls?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.frame_urls[0]} alt="" className="w-14 h-14 object-cover rounded-md border border-zinc-800" />
              )}
              <div className="flex-1 min-w-40">
                <div className="font-medium">{f.slug}</div>
                <div className="text-sm text-zinc-500">
                  {f.description || 'No description yet'}
                  {f.expected?.shot_detected === false ? ' · expects NO shot' : ''}
                </div>
              </div>
              <label className="text-sm text-zinc-400 flex items-center gap-2">
                <input type="checkbox" checked={f.active} onChange={() => toggleActive(f)} /> include in runs
              </label>
              <button
                onClick={() => {
                  if (expanded === f.id) {
                    setExpanded(null)
                    setDraft(null)
                  } else {
                    setExpanded(f.id)
                    setDraft(buildDraft(f, criteriaNames))
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm"
              >
                {expanded === f.id ? 'Close' : 'Edit expectations'}
              </button>
              <button onClick={() => removeFixture(f)} className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-red-900 text-sm">
                Delete
              </button>
            </div>

            {expanded === f.id && draft && (
              <div className="mt-4 space-y-4 border-t border-zinc-800 pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-zinc-400">
                    Description (what makes this shot a useful reference)
                    <input
                      value={draft.description}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white"
                      placeholder="e.g. Adult, side angle, badly flared elbow"
                    />
                  </label>
                  <label className="text-sm text-zinc-400 flex items-end gap-2 pb-2">
                    <input
                      type="checkbox"
                      checked={draft.noShot}
                      onChange={(e) => setDraft({ ...draft, noShot: e.target.checked })}
                    />
                    This clip contains NO shot — the grader must say so
                  </label>
                </div>

                {!draft.noShot && (
                  <>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                      <span>Overall score must land between</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        step={0.5}
                        value={draft.overallLo}
                        onChange={(e) => setDraft({ ...draft, overallLo: e.target.value })}
                        className="w-20 rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1 text-white"
                      />
                      <span>and</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        step={0.5}
                        value={draft.overallHi}
                        onChange={(e) => setDraft({ ...draft, overallHi: e.target.value })}
                        className="w-20 rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1 text-white"
                      />
                      <span className="mx-2">·</span>
                      <span>Player type</span>
                      <select
                        value={draft.playerType}
                        onChange={(e) => setDraft({ ...draft, playerType: e.target.value })}
                        className="rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1 text-white"
                      >
                        <option value="">don&apos;t check</option>
                        {PLAYER_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {Object.entries(FLAG_LABELS).map(([fn, label]) => (
                        <label key={fn} className="text-sm text-zinc-400 flex items-center justify-between gap-2 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2">
                          {label}
                          <select
                            value={draft.flags[fn]}
                            onChange={(e) =>
                              setDraft({ ...draft, flags: { ...draft.flags, [fn]: e.target.value as 'skip' | 'yes' | 'no' } })
                            }
                            className="rounded-lg bg-zinc-950 border border-zinc-700 px-2 py-1 text-white"
                          >
                            <option value="skip">don&apos;t check</option>
                            <option value="yes">must be flagged</option>
                            <option value="no">must NOT be flagged</option>
                          </select>
                        </label>
                      ))}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-zinc-500 text-left">
                            <th className="py-1 pr-3 font-medium">Criterion</th>
                            <th className="py-1 pr-3 font-medium">Check</th>
                            <th className="py-1 pr-3 font-medium">Min</th>
                            <th className="py-1 font-medium">Max</th>
                          </tr>
                        </thead>
                        <tbody>
                          {criteriaNames.map((name) => {
                            const c = draft.criteria[name]
                            if (!c) return null
                            return (
                              <tr key={name} className="border-t border-zinc-800">
                                <td className="py-1.5 pr-3 text-zinc-300">{name}</td>
                                <td className="py-1.5 pr-3">
                                  <select
                                    value={c.mode}
                                    onChange={(e) =>
                                      setDraft({
                                        ...draft,
                                        criteria: {
                                          ...draft.criteria,
                                          [name]: { ...c, mode: e.target.value as 'skip' | 'range' | 'null' },
                                        },
                                      })
                                    }
                                    className="rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1 text-white"
                                  >
                                    <option value="skip">don&apos;t check</option>
                                    <option value="range">score range</option>
                                    <option value="null">must stay ungraded</option>
                                  </select>
                                </td>
                                <td className="py-1.5 pr-3">
                                  {c.mode === 'range' && (
                                    <input
                                      type="number"
                                      min={1}
                                      max={10}
                                      step={0.5}
                                      value={c.lo}
                                      onChange={(e) =>
                                        setDraft({
                                          ...draft,
                                          criteria: { ...draft.criteria, [name]: { ...c, lo: e.target.value } },
                                        })
                                      }
                                      className="w-20 rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1 text-white"
                                    />
                                  )}
                                </td>
                                <td className="py-1.5">
                                  {c.mode === 'range' && (
                                    <input
                                      type="number"
                                      min={1}
                                      max={10}
                                      step={0.5}
                                      value={c.hi}
                                      onChange={(e) =>
                                        setDraft({
                                          ...draft,
                                          criteria: { ...draft.criteria, [name]: { ...c, hi: e.target.value } },
                                        })
                                      }
                                      className="w-20 rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1 text-white"
                                    />
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => saveDraft(f)}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-red-600 disabled:opacity-40 font-medium"
                  >
                    {saving ? 'Saving…' : 'Save expectations'}
                  </button>
                  <button
                    onClick={() => {
                      setExpanded(null)
                      setDraft(null)
                    }}
                    className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ---- Add reference shots ---- */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <h2 className="text-lg font-semibold">Add a reference shot</h2>
        <p className="text-sm text-zinc-500">
          Pick from recent analyses — ones marked <span className="text-orange-400">reviewed</span> already carry your
          Learn Mode corrections, so their expected ranges start out accurate. After adding, open “Edit expectations”
          to tighten the ranges.
        </p>
        {addError && <p className="text-sm text-red-400">{addError}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {recent
            .filter((r) => !fixtures.some((f) => f.analysis_id === r.id))
            .map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                {r.thumb && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.thumb} alt="" className="w-12 h-12 object-cover rounded-md border border-zinc-800" />
                )}
                <div className="flex-1 text-sm">
                  <div className="text-zinc-300">
                    Analysis #{r.id} · scored {Number(r.overall_score)}
                    {r.corrected && <span className="ml-2 text-orange-400">reviewed</span>}
                  </div>
                  <div className="text-zinc-600">{new Date(r.created_at).toLocaleDateString()}</div>
                </div>
                <button
                  onClick={() => addFixture(r.id)}
                  disabled={addingId === r.id}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-sm"
                >
                  {addingId === r.id ? 'Adding…' : 'Add'}
                </button>
              </div>
            ))}
        </div>
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <span>Older analysis? Enter its ID:</span>
          <input
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            className="w-28 rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-1.5 text-white"
            placeholder="e.g. 412"
          />
          <button
            onClick={() => {
              const id = parseInt(manualId, 10)
              if (Number.isInteger(id)) {
                addFixture(id)
                setManualId('')
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
