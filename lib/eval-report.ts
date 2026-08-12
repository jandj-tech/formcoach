// Pure eval math shared by the admin Test Bench page (client), the API
// routes, and the CLI scripts. No imports — safe in any runtime.

export interface EvalGrader {
  prompt_sha: string
  rubric_tags: string[]
  model: string
  passes: number
  calibration_version: number | null
}

/** One full analyzeShot() result, reduced to what the eval compares. */
export interface EvalRun {
  shot_detected: boolean
  overall: number
  criteria: Record<string, number | null>
  flags: Record<string, boolean>
  player_type: string
  grader: EvalGrader | null
}

/** Repeat runs of one fixture merged into a single comparable record. */
export interface EvalSummary {
  runs: number
  shot_detected: boolean
  overall: number | null
  overall_spread: number | null
  worst_criterion_spread: number | null
  criteria: Record<string, number | null>
  flags: Record<string, boolean>
  player_type: string | null
  consistency_issues: string[]
  grader: EvalGrader | null
}

export interface EvalExpected {
  overall?: [number, number]
  criteria?: Record<string, [number, number] | 'null'>
  flags?: Record<string, boolean>
  player_type?: string
  shot_detected?: boolean
}

/** What gets stored per fixture in an accepted baseline. */
export interface BaselineEntry {
  shot_detected: boolean
  overall?: number | null
  criteria?: Record<string, number | null>
  flags?: Record<string, boolean>
  player_type?: string | null
}

// Spread thresholds carried over from tmp-consistency2.mjs.
export const SPREAD_PASS = 0.1
export const SPREAD_CLOSE = 0.5
// A criterion moving more than this vs baseline counts as drift.
export const DRIFT_THRESHOLD = 0.5

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10
}

export function aggregateRuns(runs: EvalRun[]): EvalSummary {
  const detectedVotes = runs.map((r) => r.shot_detected !== false)
  const shotDetected = detectedVotes.filter(Boolean).length * 2 > detectedVotes.length
  const grader = runs[runs.length - 1]?.grader ?? null
  if (!shotDetected) {
    return {
      runs: runs.length,
      shot_detected: false,
      overall: null,
      overall_spread: null,
      worst_criterion_spread: null,
      criteria: {},
      flags: {},
      player_type: null,
      consistency_issues: [],
      grader,
    }
  }

  const consistencyIssues: string[] = []
  const byName: Record<string, Array<number | null>> = {}
  for (const run of runs) {
    for (const [name, score] of Object.entries(run.criteria)) {
      ;(byName[name] ??= []).push(score)
    }
  }
  const criteria: Record<string, number | null> = {}
  let worstSpread = 0
  for (const [name, vals] of Object.entries(byName)) {
    const scored = vals.filter((v): v is number => v !== null && v !== undefined)
    if (scored.length > 0 && scored.length < vals.length) {
      consistencyIssues.push(`"${name}" ungraded in ${vals.length - scored.length}/${vals.length} runs, scored in the rest`)
    }
    if (scored.length >= 2) worstSpread = Math.max(worstSpread, Math.max(...scored) - Math.min(...scored))
    criteria[name] = scored.length * 2 > vals.length ? median(scored) : null
  }

  const overalls = runs.map((r) => r.overall)
  const flags: Record<string, boolean> = {}
  const flagNames = new Set(runs.flatMap((r) => Object.keys(r.flags)))
  for (const fn of flagNames) {
    const votes = runs.map((r) => !!r.flags[fn])
    flags[fn] = votes.filter(Boolean).length * 2 > votes.length
    if (new Set(votes).size > 1) consistencyIssues.push(`flag ${fn} disagreed across runs: ${votes.join(', ')}`)
  }

  const typeCounts = new Map<string, number>()
  for (const r of runs) typeCounts.set(r.player_type, (typeCounts.get(r.player_type) ?? 0) + 1)
  const playerType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  return {
    runs: runs.length,
    shot_detected: true,
    overall: median(overalls),
    overall_spread: runs.length > 1 ? Math.round((Math.max(...overalls) - Math.min(...overalls)) * 100) / 100 : null,
    worst_criterion_spread: runs.length > 1 ? Math.round(worstSpread * 100) / 100 : null,
    criteria,
    flags,
    player_type: playerType,
    consistency_issues: consistencyIssues,
    grader,
  }
}

/** Returns one line per violated expectation; empty array = accuracy pass. */
export function checkAccuracy(expected: EvalExpected, s: EvalSummary): string[] {
  const errors: string[] = []
  if (expected.shot_detected === false) {
    if (s.shot_detected) errors.push('shot_detected: expected false (no shot in this clip), got true')
    return errors
  }
  if (!s.shot_detected) {
    errors.push('shot_detected: expected true, got false — fixture could not be graded')
    return errors
  }
  if (Array.isArray(expected.overall) && s.overall !== null) {
    const [lo, hi] = expected.overall
    if (s.overall < lo || s.overall > hi) errors.push(`overall ${s.overall} outside expected [${lo}, ${hi}]`)
  }
  for (const [name, exp] of Object.entries(expected.criteria ?? {})) {
    const got = s.criteria[name]
    if (got === undefined) {
      errors.push(`"${name}" not present in results — renamed or deactivated criterion?`)
    } else if (exp === 'null') {
      if (got !== null) errors.push(`"${name}" expected ungraded (must not be guessed), got ${got}`)
    } else if (Array.isArray(exp)) {
      if (got === null) errors.push(`"${name}" expected [${exp[0]}, ${exp[1]}], got ungraded`)
      else if (got < exp[0] || got > exp[1]) errors.push(`"${name}" ${got} outside expected [${exp[0]}, ${exp[1]}]`)
    }
  }
  for (const [fn, expFlag] of Object.entries(expected.flags ?? {})) {
    if (!!s.flags[fn] !== !!expFlag) errors.push(`flag ${fn}: expected ${expFlag}, got ${!!s.flags[fn]}`)
  }
  if (expected.player_type && s.player_type !== expected.player_type) {
    errors.push(`player_type: expected ${expected.player_type}, got ${s.player_type}`)
  }
  return errors
}

/** Returns one line per change vs the accepted baseline; lines marked DRIFT count as regressions. */
export function diffBaseline(prev: BaselineEntry | undefined, s: EvalSummary): string[] {
  if (!prev) return []
  const lines: string[] = []
  if (prev.shot_detected !== s.shot_detected) {
    lines.push(`shot_detected ${prev.shot_detected} → ${s.shot_detected}  ◀ DRIFT`)
    return lines
  }
  if (typeof prev.overall === 'number' && s.overall !== null && Math.abs(prev.overall - s.overall) > 0.05) {
    const d = s.overall - prev.overall
    lines.push(`overall ${prev.overall} → ${s.overall} (${d > 0 ? '+' : ''}${d.toFixed(1)})${Math.abs(d) > DRIFT_THRESHOLD ? '  ◀ DRIFT' : ''}`)
  }
  for (const [name, was] of Object.entries(prev.criteria ?? {})) {
    const got = s.criteria[name]
    if (got === undefined) continue
    if (was === null && got !== null) lines.push(`"${name}" ungraded → ${got}  ◀ DRIFT`)
    else if (was !== null && got === null) lines.push(`"${name}" ${was} → ungraded  ◀ DRIFT`)
    else if (was !== null && got !== null && Math.abs(was - got) > DRIFT_THRESHOLD) lines.push(`"${name}" ${was} → ${got}  ◀ DRIFT`)
  }
  for (const [fn, was] of Object.entries(prev.flags ?? {})) {
    if (!!s.flags[fn] !== !!was) lines.push(`flag ${fn} ${was} → ${!!s.flags[fn]}  ◀ DRIFT`)
  }
  if (prev.player_type && prev.player_type !== s.player_type) {
    lines.push(`player_type ${prev.player_type} → ${s.player_type}  ◀ DRIFT`)
  }
  return lines
}

export const countDrift = (lines: string[]) => lines.filter((l) => l.includes('◀ DRIFT')).length

export function toBaselineEntry(s: EvalSummary): BaselineEntry {
  if (!s.shot_detected) return { shot_detected: false }
  return {
    shot_detected: true,
    overall: s.overall,
    criteria: s.criteria,
    flags: s.flags,
    player_type: s.player_type,
  }
}
