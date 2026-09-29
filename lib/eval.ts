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

/**
 * Downloads a fixture's frames, retrying each one.
 *
 * 28 frames per fixture across 28 fixtures is 784 fetches an arm, and without
 * retries every one is a point of failure that loses the WHOLE fixture — the
 * eval reports DID NOT RUN, the arm covers fewer fixtures than every other
 * arm, and the comparison is dead. At even a 1% per-fetch failure rate that is
 * a ~24% chance of losing any given fixture (1 - 0.99^28).
 *
 * This is what actually cost most of tonight's arms. I blamed grading-pass
 * concurrency first, but the downloads were the unprotected part: one arm lost
 * 27 of 28 fixtures to timeouts and ECONNRESET while the network tested clean
 * moments afterwards.
 */
async function downloadFrames(frameUrls: string[]): Promise<string[]> {
  const frames: string[] = []
  for (const url of frameUrls) {
    const cached = readCachedFrame(url)
    if (cached) {
      frames.push(cached)
      continue
    }
    let lastErr: unknown
    let got: string | null = null
    for (let attempt = 0; attempt < 6 && got === null; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
        if (!res.ok) {
          // A 404 is permanent — a dead frame URL will not heal, and retrying
          // it five more times only slows the failure down.
          if (res.status === 404) throw new Error(`frame gone (404): ${url}`)
          lastErr = new Error(`status ${res.status}`)
          continue
        }
        got = Buffer.from(await res.arrayBuffer()).toString('base64')
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('frame gone')) throw err
        lastErr = err
      }
    }
    if (got === null) {
      throw new Error(
        `frame download failed after 6 attempts: ${url} — ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
      )
    }
    writeCachedFrame(url, got)
    frames.push(got)
  }
  return FRAME_UPSCALE > 1 ? upscaleFrames(frames, FRAME_UPSCALE) : frames
}

/**
 * On-disk cache for fixture frames, keyed by URL.
 *
 * A fixture's frames are PINNED and immutable — that is the whole point of the
 * Test Bench, and `frames_hash` verifies it — so re-downloading 784 of them on
 * every arm is pure waste and, worse, pure risk. Frame downloads have been the
 * single largest source of lost fixtures: one arm lost 27 of 28 to transient
 * failures, and a 3-pass arm lost 13 of 28 to a mixture of download failures
 * and timeouts. A lost fixture does not just cost itself, it makes the whole
 * arm non-comparable to every other arm.
 *
 * With the cache warm an arm makes ZERO frame requests, which removes that
 * failure mode entirely and cuts several minutes off every run.
 *
 * EVAL_FRAME_CACHE sets the directory; unset disables caching so CI or a
 * one-off verification can still exercise the real download path.
 */
const FRAME_CACHE_DIR = process.env.EVAL_FRAME_CACHE ?? '.eval-frame-cache'

function frameCachePath(url: string): string | null {
  if (!FRAME_CACHE_DIR) return null
  return `${FRAME_CACHE_DIR}/${createHash('sha256').update(url).digest('hex')}.b64`
}

function readCachedFrame(url: string): string | null {
  const p = frameCachePath(url)
  if (!p) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require('fs') as typeof import('fs')
    return readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

function writeCachedFrame(url: string, b64: string): void {
  const p = frameCachePath(url)
  if (!p) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { mkdirSync, writeFileSync } = require('fs') as typeof import('fs')
    mkdirSync(FRAME_CACHE_DIR, { recursive: true })
    writeFileSync(p, b64)
  } catch {
    // A cache that cannot be written is a performance problem, not a
    // correctness one — the download already succeeded.
  }
}

/**
 * FRAME_UPSCALE=2 resamples every frame before grading.
 *
 * This adds NO information — the frames are already at their source
 * resolution, verified by probing the stored videos (464x832 to 576x1024, gain
 * 1.0x, so there is no lost detail to recover). What it changes is
 * TOKENISATION: a vision model splits an image into fixed-size patches, so a
 * 464-pixel-wide frame gives the shooter only about six patches of height and
 * every spatial judgement inside the body has to survive that. Resampling 2x
 * gives four times the patches over the same content.
 *
 * The hypothesis is worth testing precisely because it is cheap and because
 * everything else about the input has been ruled out: five architecturally
 * different models (including one ~30x the size of the smallest) miss the same
 * cells — 71% of failing cells are missed by 4 or 5 of 5 — which points at the
 * shared input rather than at any model's weights.
 *
 * Upscaling pinned frames is the clean form of the experiment: identical
 * information, different patch grid, so any difference is attributable to the
 * encoding alone.
 */
const FRAME_UPSCALE = Number(process.env.FRAME_UPSCALE || '1') || 1

/**
 * EVAL_CROP=1 grades a tight crop around the shooter instead of the whole frame.
 *
 * WHY THIS IS THE ONE INTERVENTION LEFT THAT CAN WORK: three rubric generations
 * have died on the same wall. The shooter is roughly a fifth of the frame height,
 * so the ball is ~21px, the hand ~15px and a finger ~3px against 8px JPEG
 * blocking — and no amount of rubric prose can recover a distinction that is not
 * in the image. Measured correlation with the expert is r = 0.26-0.50 pooled, and
 * two criteria sit at r = 0.01 and r = 0.07, i.e. emitting plausible numbers
 * unrelated to what the expert saw.
 *
 * lib/frame-extraction.ts already recorded that cropping's "arithmetic works" and
 * that it was disabled for ONE reason: locating the player by frame differencing
 * fails on panned or handheld clips, and once cut a real submission's player out
 * of shot entirely. That comment also named the fix — the box must come from the
 * detector that already looks at these frames. scripts/eval/crop-boxes.mjs is
 * that detector, and it validates every box before writing it.
 *
 * This is an EVAL-ONLY switch. It changes what the grader sees, so it must be
 * proven on the fixtures before it goes anywhere near the upload path.
 */
/**
 * EVAL_REEXTRACT=1 grades the tighter-window frames produced by
 * scripts/eval/reextract.mjs instead of the pinned ones.
 *
 * The pinned frames span 2.5s while the graded mechanics take ~0.4s, so ~23 of
 * 28 frames show wind-up and a held follow-through. Re-extracting around the
 * release puts all 28 on the shot itself. The frames_hash check is skipped in
 * this mode by definition — these are deliberately NOT the pinned frames — so an
 * arm run this way is comparable to other re-extracted arms, not to pinned ones.
 */
const EVAL_REEXTRACT = process.env.EVAL_REEXTRACT === '1'

function reextractedFrames(slug: string): string[] | null {
  if (!EVAL_REEXTRACT) return null
  const { readdirSync, readFileSync, existsSync } = require('fs') as typeof import('fs')
  const dir = `.eval-reextract/${slug}`
  if (!existsSync(dir)) return null
  const files = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort()
  if (files.length === 0) return null
  return files.map((f) => readFileSync(`${dir}/${f}`).toString('base64'))
}

const EVAL_CROP = process.env.EVAL_CROP === '1'
// Asymmetric on purpose. The vertical extremes are the two things that must
// never be lost: the ball at the top of the release, and the feet at the bottom.
// Sized against the measured trade-off rather than a guess: 0/0 gives 3.9x mean
// linear gain, 0.08/0.12 gives 2.1x, and 0.12/0.22 gives 1.7x. The hand is ~15px
// against a 14px patch, so a gain below about 2x leaves it barely over one patch
// and the whole point is lost; much above that and a moving shooter risks
// clipping. Vertical gets the larger share because the ball at the top of the
// release and the feet at the bottom are the two things that must never be lost,
// and only 1 of 24 boxes already reaches the bottom of its frame.
const CROP_MARGIN_X = Number(process.env.EVAL_CROP_MARGIN_X ?? '0.08')
const CROP_MARGIN_Y = Number(process.env.EVAL_CROP_MARGIN_Y ?? '0.12')
let cropBoxes: Record<string, { x0?: number; y0?: number; x1?: number; y1?: number; skip?: string }> | null = null

async function cropToShooter(slug: string, framesB64: string[]): Promise<string[]> {
  let loaded = cropBoxes
  if (loaded === null) {
    const { readFileSync, existsSync } = await import('fs')
    const path = 'scripts/eval/crop-boxes.json'
    if (!existsSync(path)) {
      throw new Error('EVAL_CROP=1 but scripts/eval/crop-boxes.json is missing — run scripts/eval/crop-boxes.mjs first')
    }
    loaded = JSON.parse(readFileSync(path, 'utf8'))
    cropBoxes = loaded
  }
  const box = loaded?.[slug]
  // No box, or a box that failed validation, grades UNCROPPED. A fixture that
  // silently dropped out would make the arm non-comparable; a wide frame is a
  // worse measurement but still a measurement.
  if (!box || box.skip || box.x0 === undefined) return framesB64

  const { default: sharp } = await import('sharp')
  return Promise.all(
    framesB64.map(async (b64) => {
      const img = sharp(Buffer.from(b64, 'base64'))
      const { width, height } = await img.metadata()
      if (!width || !height) return b64
      // Margin in fractions of the frame, clamped inside it. Generous by design:
      // the recorded failure mode is a crop that cuts off a hand or a foot, and
      // losing the ball at the top of the release would break several criteria
      // outright.
      const x0 = Math.max(0, (box.x0 as number) - CROP_MARGIN_X)
      const y0 = Math.max(0, (box.y0 as number) - CROP_MARGIN_Y)
      const x1 = Math.min(1, (box.x1 as number) + CROP_MARGIN_X)
      const y1 = Math.min(1, (box.y1 as number) + CROP_MARGIN_Y)
      const left = Math.round(x0 * width)
      const top = Math.round(y0 * height)
      const w = Math.max(16, Math.round((x1 - x0) * width))
      const h = Math.max(16, Math.round((y1 - y0) * height))
      // CROP AND THEN RESTORE THE ORIGINAL DIMENSIONS. The restore is the half
      // that actually matters, and cropping alone would be close to a no-op.
      //
      // Measured: this provider bills ~1836 input tokens for a 464x832 frame,
      // which matches a 14px patch grid (33 x 59 = 1958) — it is not downsizing
      // our frames, so a smaller image simply buys fewer tokens at the same
      // pixels-per-patch, and the shooter gains nothing.
      //
      // What upscaling changes is how many PATCHES cover a feature, and that is
      // the binding limit here: the hand is ~15px against a 14px patch, so the
      // whole hand is one token — a single vector summarising it, with no way to
      // express its shape. A finger at ~3px is a fifth of a patch. Crop to ~30%
      // of frame area and restore, and the hand spans roughly 4 patches instead
      // of 1, at identical token cost.
      //
      // This does NOT add information — upscaling never does, which is why
      // FRAME_UPSCALE alone did nothing. It makes information the pixels already
      // hold expressible in the token grid.
      const out = await img
        .extract({
          left,
          top,
          width: Math.min(w, width - left),
          height: Math.min(h, height - top),
        })
        .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
        .jpeg({ quality: 92 })
        .toBuffer()
      return out.toString('base64')
    })
  )
}

async function upscaleFrames(framesB64: string[], factor: number): Promise<string[]> {
  const { default: sharp } = await import('sharp')
  return Promise.all(
    framesB64.map(async (b64) => {
      const img = sharp(Buffer.from(b64, 'base64'))
      const { width, height } = await img.metadata()
      if (!width || !height) return b64
      const out = await img
        // Lanczos: the sharpest of the practical resamplers, which matters when
        // the point is to preserve what edge detail the frame has rather than
        // to smooth it away.
        .resize(Math.round(width * factor), Math.round(height * factor), { kernel: 'lanczos3' })
        .jpeg({ quality: 90 })
        .toBuffer()
      return out.toString('base64')
    })
  )
}

const hashFrames = (frames: string[]) =>
  createHash('sha256').update(frames.join('|')).digest('hex')

/**
 * Runs ONE full grading (the normal N-pass ensemble) on a fixture's pinned
 * frames and reduces the result to the comparable EvalRun shape. Frames are
 * hash-verified so a mutated or re-encoded blob can never silently change
 * what the eval grades.
 */
/**
 * Same grading path as runFixtureOnce, but returns the model's REASONING with
 * each score instead of discarding it.
 *
 * runFixtureOnce flattens the result to { criterionName: score } because that is
 * all the pass/fail report needs. The consequence is that every arm in this
 * project has reported numbers while throwing away the model's own account of
 * why it produced them — so a cell 4.5 points outside the expert's band was only
 * ever visible as a number. This exists to read the justification on the worst
 * cells before changing anything, which is the step that was missing.
 *
 * Not used by the eval itself: diagnosis only, via scripts/eval/why.mjs.
 */
export async function runFixtureOnceVerbose(
  fixture: Pick<EvalFixtureRow, 'slug' | 'frames_hash' | 'frame_urls'>,
  opts?: { passes?: number }
): Promise<{
  criteria: Array<{ name: string; score: number | null; reasoning: string; evidence?: string }>
  flags: Record<string, boolean>
  shot_detected: boolean
}> {
  const frames = await downloadFrames(fixture.frame_urls)
  const graded = EVAL_CROP ? await cropToShooter(fixture.slug, frames) : frames
  const mimes = graded.map(() => 'image/jpeg')
  const result = await analyzeShot(graded, mimes, opts?.passes ? { passes: opts.passes } : undefined)
  const nameById = await loadCriteriaNames()
  return {
    criteria: result.criteria.map((c) => ({
      name: nameById[c.id] ?? `id:${c.id}`,
      score: c.score,
      reasoning: c.reasoning,
      evidence: (c as { evidence?: string }).evidence,
    })),
    flags: result.critical_flags as unknown as Record<string, boolean>,
    shot_detected: result.shot_detected !== false,
  }
}

export async function runFixtureOnce(
  fixture: Pick<EvalFixtureRow, 'slug' | 'frames_hash' | 'frame_urls'>,
  opts?: { passes?: number }
): Promise<EvalRun> {
  const reextracted = reextractedFrames(fixture.slug)
  const frames = reextracted ?? (await downloadFrames(fixture.frame_urls))
  const hash = hashFrames(frames)
  if (!reextracted && hash !== fixture.frames_hash) {
    throw new Error(
      `frames_hash mismatch for "${fixture.slug}": the stored frames no longer match this fixture. Re-create the fixture from a fresh analysis.`
    )
  }
  // Cropping happens AFTER the hash check, deliberately: the hash is what proves
  // a fixture's frames are still the pinned ones, so it has to be taken on the
  // bytes as stored. Cropping first would make every fixture fail verification.
  const graded = EVAL_CROP ? await cropToShooter(fixture.slug, frames) : frames
  const mimes = graded.map(() => 'image/jpeg')
  const result = await analyzeShot(graded, mimes, opts?.passes ? { passes: opts.passes } : undefined)
  const nameById = await loadCriteriaNames()

  const criteria: Record<string, number | null> = {}
  const evidence: Record<string, string> = {}
  for (const c of result.criteria) {
    const name = nameById[c.id] ?? `id:${c.id}`
    criteria[name] = c.score
    const ev = (c as { evidence?: string }).evidence
    if (ev) evidence[name] = ev
  }
  return {
    shot_detected: result.shot_detected !== false,
    overall: result.overall_score,
    criteria,
    evidence,
    flags: { ...result.critical_flags },
    // Raw 0-10 confidences, not just the fired booleans. The caps fire at >= 7
    // and have been measured never firing: on a genuine catapult that the owner
    // scored 2-4, elbow_severely_out came back at 3. Recording the confidence
    // itself makes that visible instead of showing an all-false flag set.
    flag_confidence: result.flag_confidence ? { ...result.flag_confidence } : undefined,
    player_type: result.player_assessment?.player_type ?? 'recreational',
    grader: result.grader_version ?? null,
    set_point: result.set_point_check
      ? { frame: result.set_point_check.frame, verdict: result.set_point_check.verdict }
      : null,
    frame_checks: result.frame_checks ? { applied: result.frame_checks.applied, bounds: result.frame_checks.bounds } : null,
  }
}

/**
 * Creates a fixture row from an existing analysis: pins its frames, and
 * prefills the expected ranges from the expert's corrections where they
 * exist (admin_score), otherwise from the AI scores — ±1.0 per criterion,
 * ±0.5 overall. The owner then tightens the ranges in the admin Test Bench.
 *
 * Either way `expected.criteria_source` records which of the two each range
 * came from, so the eval can keep AI-seeded (circular) cells out of its
 * accuracy number.
 *
 * `opts.derivedExpectations: false` drops the overall / flags / player_type
 * expectations and keeps only the per-criterion ones. Use it for bulk imports,
 * where nobody is going to hand-tighten the ranges: `overall` is a
 * deterministic function of the criteria, so asserting it too double-counts
 * the same signal inside a ±0.5 band, and `flags`/`player_type` are exact-match
 * assertions on unreviewed model output. Left on for the Test Bench, where the
 * owner sees the prefill and edits it.
 */
export async function authorFixtureFromAnalysis(
  analysisId: number,
  slug: string,
  opts?: { derivedExpectations?: boolean }
): Promise<EvalFixtureRow> {
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
  const criteriaSource: NonNullable<EvalExpected['criteria_source']> = {}
  for (const s of scores) {
    const corrected = s.admin_score !== null
    const base = s.admin_score ?? s.ai_score
    criteriaSource[s.name] = corrected ? 'expert' : 'ai'
    criteria[s.name] =
      base === null
        ? 'null'
        : [Math.max(1, half(Number(base) - 1)), Math.min(10, half(Number(base) + 1))]
  }
  const overall = Number(a.overall_score)
  const derived = opts?.derivedExpectations !== false
  const expected: EvalExpected = {
    ...(derived
      ? {
          overall: [Math.max(1, half(overall - 0.5)), Math.min(10, half(overall + 0.5))] as [number, number],
          flags: a.critical_flags ?? {},
          player_type: a.player_type ?? 'recreational',
        }
      : {}),
    criteria,
    criteria_source: criteriaSource,
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
