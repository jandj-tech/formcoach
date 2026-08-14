// Server-side half of the grading test bench: fixture storage, frame
// fetching with integrity checks, and running the real grader on a fixture.
// The pure comparison math lives in lib/eval-report.ts.
import { createHash } from 'crypto'
import { db } from './db'
import { analyzeShot } from './analyze'
import type { EvalExpected, EvalRun } from './eval-report'

export interface EvalFixtureRow {
  id: number
  slug: string
  analysis_id: number | null
  description: string | null
  frames_hash: string
  frame_urls: string[]
  expected: EvalExpected
  active: boolean
}

const SLUG_RE = /^[a-z0-9-]{1,80}$/

async function loadCriteriaNames(): Promise<Record<number, string>> {
  const rows = (await db`SELECT id, name FROM criteria`) as unknown as Array<{ id: number; name: string }>
  return Object.fromEntries(rows.map((r) => [Number(r.id), r.name]))
}

async function downloadFrames(frameUrls: string[]): Promise<string[]> {
  const frames: string[] = []
  for (const url of frameUrls) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`frame download failed (${res.status}): ${url}`)
    frames.push(Buffer.from(await res.arrayBuffer()).toString('base64'))
  }
  return frames
}

const hashFrames = (frames: string[]) =>
  createHash('sha256').update(frames.join('|')).digest('hex')

/**
 * Runs ONE full grading (the normal N-pass ensemble) on a fixture's pinned
 * frames and reduces the result to the comparable EvalRun shape. Frames are
 * hash-verified so a mutated or re-encoded blob can never silently change
 * what the eval grades.
 */
export async function runFixtureOnce(
  fixture: Pick<EvalFixtureRow, 'slug' | 'frames_hash' | 'frame_urls'>,
  opts?: { passes?: number }
): Promise<EvalRun> {
  const frames = await downloadFrames(fixture.frame_urls)
  const hash = hashFrames(frames)
  if (hash !== fixture.frames_hash) {
    throw new Error(
      `frames_hash mismatch for "${fixture.slug}": the stored frames no longer match this fixture. Re-create the fixture from a fresh analysis.`
    )
  }
  const mimes = frames.map(() => 'image/jpeg')
  const result = await analyzeShot(frames, mimes, opts?.passes ? { passes: opts.passes } : undefined)
  const nameById = await loadCriteriaNames()

  const criteria: Record<string, number | null> = {}
  for (const c of result.criteria) {
    criteria[nameById[c.id] ?? `id:${c.id}`] = c.score
  }
  return {
    shot_detected: result.shot_detected !== false,
    overall: result.overall_score,
    criteria,
    flags: { ...result.critical_flags },
    player_type: result.player_assessment?.player_type ?? 'recreational',
    grader: result.grader_version ?? null,
  }
}

/**
 * Creates a fixture row from an existing analysis: pins its frames, and
 * prefills the expected ranges from the expert's corrections where they
 * exist (admin_score), otherwise from the AI scores — ±1.0 per criterion,
 * ±0.5 overall. The owner then tightens the ranges in the admin Test Bench.
 */
export async function authorFixtureFromAnalysis(analysisId: number, slug: string): Promise<EvalFixtureRow> {
  if (!SLUG_RE.test(slug)) throw new Error('Name must be lowercase letters, digits, and dashes only')

  const [a] = (await db`
    SELECT id, overall_score, frame_urls, frames_hash, player_type, critical_flags
    FROM analyses WHERE id = ${analysisId}
  `) as unknown as [
    | {
        id: number
        overall_score: number | string
        frame_urls: string[] | null
        frames_hash: string | null
        player_type: string | null
        critical_flags: Record<string, boolean> | null
      }
    | undefined,
  ]
  if (!a) throw new Error(`Analysis ${analysisId} not found`)
  if (!a.frame_urls || a.frame_urls.length === 0) {
    throw new Error(`Analysis ${analysisId} has no stored frames — pick one whose frames were saved`)
  }

  const scores = (await db`
    SELECT c.name, cs.ai_score, cs.admin_score
    FROM criterion_scores cs
    JOIN criteria c ON c.id = cs.criterion_id
    WHERE cs.analysis_id = ${analysisId}
    ORDER BY cs.criterion_id
  `) as unknown as Array<{ name: string; ai_score: number | string | null; admin_score: number | string | null }>
  if (scores.length === 0) throw new Error(`Analysis ${analysisId} has no criterion scores`)

  // Legacy rows may predate the frames_hash migration — compute from frames.
  let framesHash = a.frames_hash
  if (!framesHash) framesHash = hashFrames(await downloadFrames(a.frame_urls))

  const half = (v: number) => Math.round(v * 2) / 2
  const criteria: EvalExpected['criteria'] = {}
  for (const s of scores) {
    const base = s.admin_score ?? s.ai_score
    criteria[s.name] =
      base === null
        ? 'null'
        : [Math.max(1, half(Number(base) - 1)), Math.min(10, half(Number(base) + 1))]
  }
  const overall = Number(a.overall_score)
  const expected: EvalExpected = {
    overall: [Math.max(1, half(overall - 0.5)), Math.min(10, half(overall + 0.5))],
    criteria,
    flags: a.critical_flags ?? {},
    player_type: a.player_type ?? 'recreational',
    shot_detected: true,
  }

  const [row] = (await db`
    INSERT INTO eval_fixtures (slug, analysis_id, description, frames_hash, frame_urls, expected)
    VALUES (${slug}, ${analysisId}, ${''}, ${framesHash}, ${a.frame_urls}, ${db.json(asJson(expected))})
    RETURNING id, slug, analysis_id, description, frames_hash, frame_urls, expected, active
  `) as unknown as [EvalFixtureRow]
  return coerceFixture(row)
}

/**
 * db.json() takes postgres.js's JSONValue, which requires an index signature.
 * Our expectation/result interfaces are structurally JSON but declared as
 * named interfaces, so they need this pass-through cast.
 */
export const asJson = (v: unknown) => v as Parameters<typeof db.json>[0]

/**
 * jsonb columns must be written with db.json(value) — NOT
 * `${JSON.stringify(value)}::jsonb`. postgres.js infers the parameter type
 * from the jsonb context and serializes the value again, so a pre-stringified
 * object lands as a jsonb *string* rather than an object. Rows written that
 * way read back as a string, every `expected.criteria` lookup silently
 * returns undefined, and checkAccuracy then reports zero errors for every
 * fixture. This helper unwraps any such legacy row on read; the repair
 * migration (migrate-eval-json-repair.sql) fixes them at rest.
 */
export function coerceJson<T>(value: unknown, fallback: T): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return (value ?? fallback) as T
}

function coerceFixture(row: EvalFixtureRow): EvalFixtureRow {
  return { ...row, expected: coerceJson(row.expected, {} as EvalFixtureRow['expected']) }
}

export async function listFixtures(): Promise<EvalFixtureRow[]> {
  const rows = (await db`
    SELECT id, slug, analysis_id, description, frames_hash, frame_urls, expected, active
    FROM eval_fixtures ORDER BY slug
  `) as unknown as EvalFixtureRow[]
  return rows.map(coerceFixture)
}

export interface BaselineRow {
  id: number
  grader: Record<string, unknown> | null
  results: Record<string, unknown>
  accepted_at: string
}

export async function latestBaseline(): Promise<BaselineRow | null> {
  const [row] = (await db`
    SELECT id, grader, results, accepted_at FROM eval_baselines ORDER BY id DESC LIMIT 1
  `) as unknown as [BaselineRow | undefined]
  return row ?? null
}
