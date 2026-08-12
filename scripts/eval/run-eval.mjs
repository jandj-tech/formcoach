// Golden-fixture eval: re-grades every fixture with the CURRENT grader
// (rubric text + calibration + model + ensemble) and reports three things:
//
//   CONSISTENCY — spread of scores across repeat runs on identical frames
//   ACCURACY    — median of runs vs the expert-expected ranges in the fixture
//   DRIFT       — diff vs fixtures/baseline.json (the last accepted eval)
//
// This is the gate for every rubric/calibration change: edit → migrate →
// `npm run eval` → read the per-fixture diffs → accept (--accept) or revert.
//
// Usage:
//   npm run eval                     full: 2 runs × default ensemble passes
//   npm run eval:quick               1 run × 1 pass (cheap smoke, no spread)
//   npm run eval -- --only a,b       only these fixture slugs
//   npm run eval -- --runs 3         more repeat runs (better spread estimate)
//   npm run eval -- --accept         freeze this eval as the new baseline
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import postgres from 'postgres'

const args = process.argv.slice(2)
const QUICK = args.includes('--quick')
const ACCEPT = args.includes('--accept')
const runsArg = args.indexOf('--runs')
const RUNS = QUICK ? 1 : runsArg !== -1 ? Math.max(1, parseInt(args[runsArg + 1], 10) || 2) : 2
const onlyArg = args.indexOf('--only')
const ONLY = onlyArg !== -1 ? args[onlyArg + 1].split(',').map((s) => s.trim()) : null

// Spread thresholds carried over from tmp-consistency2.mjs.
const SPREAD_PASS = 0.1
const SPREAD_CLOSE = 0.5
// A criterion moving more than this vs baseline counts as drift.
const DRIFT_THRESHOLD = 0.5

const ROOT = process.cwd()
const FIXTURE_DIR = path.join(ROOT, 'fixtures', 'shots')
const CACHE_DIR = path.join(ROOT, 'fixtures', '.cache')
const BASELINE_PATH = path.join(ROOT, 'fixtures', 'baseline.json')

if (!fs.existsSync(FIXTURE_DIR)) {
  console.error('No fixtures/shots/ directory. Author fixtures first:')
  console.error('  npx tsx --env-file=.env.local scripts/eval/author-fixture.mjs <analysisId> <slug>')
  process.exit(1)
}
let fixtures = fs
  .readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, f), 'utf-8')))
if (ONLY) fixtures = fixtures.filter((f) => ONLY.includes(f.slug))
if (fixtures.length === 0) {
  console.error(ONLY ? `No fixtures match --only ${ONLY.join(',')}` : 'No fixtures found in fixtures/shots/.')
  process.exit(1)
}

const baseline = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8')) : null

// id → name mapping so results (keyed by criterion id) can be reported and
// stored by name, matching how fixtures key their expectations.
const db = postgres(process.env.DATABASE_URL, { ssl: 'require' })
const criteriaRows = await db`SELECT id, name FROM criteria`
await db.end()
const nameById = Object.fromEntries(criteriaRows.map((c) => [Number(c.id), c.name]))

const { analyzeShot } = await import('../../lib/analyze.ts')

const median = (nums) => {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10
}

async function loadFrames(fixture) {
  const dir = path.join(CACHE_DIR, String(fixture.analysis_id))
  const cached = fixture.frame_urls.map((_, i) => path.join(dir, `frame-${i}.b64`))
  let frames
  if (cached.every((p) => fs.existsSync(p))) {
    frames = cached.map((p) => fs.readFileSync(p, 'utf-8'))
  } else {
    frames = []
    for (const url of fixture.frame_urls) {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`download failed ${url}: HTTP ${res.status}`)
      frames.push(Buffer.from(await res.arrayBuffer()).toString('base64'))
    }
  }
  // Integrity gate: a mutated or re-encoded blob must never silently change
  // what the eval grades. Hard fail on mismatch.
  const hash = crypto.createHash('sha256').update(frames.join('|')).digest('hex')
  if (hash !== fixture.frames_hash) {
    throw new Error(
      `frames_hash mismatch for "${fixture.slug}": expected ${fixture.frames_hash.slice(0, 12)}…, got ${hash.slice(0, 12)}…\n` +
        `The blob frames no longer match the fixture. Delete fixtures/.cache/${fixture.analysis_id}/ and retry; if it still fails, re-author the fixture.`
    )
  }
  if (!cached.every((p) => fs.existsSync(p))) {
    fs.mkdirSync(dir, { recursive: true })
    frames.forEach((b64, i) => fs.writeFileSync(cached[i], b64))
  }
  return frames
}

const totalCalls = fixtures.length * RUNS * (QUICK ? 1 : parseInt(process.env.ANALYSIS_PASSES || '3', 10) || 3)
console.log(`Evaluating ${fixtures.length} fixture(s) × ${RUNS} run(s)${QUICK ? ' × 1 pass (quick)' : ''} ≈ ${totalCalls} model calls\n`)

let accuracyFailures = 0
let regressions = 0
let graderVersion = null
const baselineOut = {}

for (const fixture of fixtures) {
  console.log(`── ${fixture.slug} ${'─'.repeat(Math.max(0, 50 - fixture.slug.length))}`)
  let frames
  try {
    frames = await loadFrames(fixture)
  } catch (err) {
    console.error(`  ✗ ${err.message}`)
    accuracyFailures++
    continue
  }
  const mimes = frames.map(() => 'image/jpeg')

  const runs = []
  for (let r = 0; r < RUNS; r++) {
    runs.push(await analyzeShot(frames, mimes, QUICK ? { passes: 1 } : {}))
  }
  graderVersion = runs[runs.length - 1].grader_version ?? graderVersion

  const expected = fixture.expected ?? {}

  // ---- shot detection -------------------------------------------------
  const detectedVotes = runs.map((r) => r.shot_detected !== false)
  const detected = detectedVotes.filter(Boolean).length * 2 > detectedVotes.length
  if (expected.shot_detected === false) {
    if (detected) {
      console.error(`  ✗ ACCURACY shot_detected: expected false, got true`)
      accuracyFailures++
    } else {
      console.log(`  ✓ shot_detected: false (as expected)`)
    }
    baselineOut[fixture.slug] = { shot_detected: detected }
    console.log()
    continue
  }
  if (!detected) {
    console.error(`  ✗ ACCURACY shot_detected: expected true, got false — cannot grade this fixture`)
    accuracyFailures++
    baselineOut[fixture.slug] = { shot_detected: false }
    console.log()
    continue
  }

  // ---- per-criterion merge across runs (keyed by name) ----------------
  const byName = {}
  for (const run of runs) {
    for (const c of run.criteria) {
      const name = nameById[c.id] ?? `id:${c.id}`
      ;(byName[name] ??= []).push(c.score)
    }
  }
  const criteriaMedians = {}
  const consistencyIssues = []
  let worstSpread = 0
  for (const [name, vals] of Object.entries(byName)) {
    const scored = vals.filter((v) => v !== null && v !== undefined)
    if (scored.length > 0 && scored.length < vals.length) {
      consistencyIssues.push(`"${name}" null in ${vals.length - scored.length}/${vals.length} runs, scored in the rest`)
    }
    if (scored.length >= 2) {
      worstSpread = Math.max(worstSpread, Math.max(...scored) - Math.min(...scored))
    }
    criteriaMedians[name] = scored.length * 2 > vals.length ? median(scored.map(Number)) : null
  }

  const overalls = runs.map((r) => r.overall_score)
  const overallMedian = median(overalls)
  const overallSpread = Math.max(...overalls) - Math.min(...overalls)

  // Flags: majority across runs, plus disagreement report.
  const flagNames = ['elbow_severely_out', 'followthrough_flick_to_side', 'arc_too_flat', 'chest_pass_hands']
  const flags = {}
  for (const fn of flagNames) {
    const votes = runs.map((r) => !!r.critical_flags?.[fn])
    flags[fn] = votes.filter(Boolean).length * 2 > votes.length
    if (new Set(votes).size > 1) consistencyIssues.push(`flag ${fn} disagreed across runs: ${votes.join(', ')}`)
  }
  const playerTypes = runs.map((r) => r.player_assessment?.player_type ?? 'recreational')
  const playerType = playerTypes.sort((a, b) => playerTypes.filter((v) => v === b).length - playerTypes.filter((v) => v === a).length)[0]

  // ---- consistency report ---------------------------------------------
  if (RUNS > 1) {
    const grade = overallSpread <= SPREAD_PASS ? 'PASS' : overallSpread <= SPREAD_CLOSE ? 'CLOSE' : 'FAIL'
    console.log(`  ${grade === 'FAIL' ? '✗' : '✓'} CONSISTENCY overall spread ${overallSpread.toFixed(2)} (${grade}), worst criterion spread ${worstSpread.toFixed(2)}`)
    for (const issue of consistencyIssues) console.log(`    ⚠ ${issue}`)
  }

  // ---- accuracy vs expected --------------------------------------------
  const accuracyErrors = []
  if (Array.isArray(expected.overall)) {
    const [lo, hi] = expected.overall
    if (overallMedian < lo || overallMedian > hi) accuracyErrors.push(`overall ${overallMedian} outside expected [${lo}, ${hi}]`)
  }
  for (const [name, exp] of Object.entries(expected.criteria ?? {})) {
    const got = criteriaMedians[name]
    if (got === undefined) {
      accuracyErrors.push(`"${name}" not present in results — renamed or deactivated criterion?`)
    } else if (exp === 'null') {
      if (got !== null) accuracyErrors.push(`"${name}" expected null (must not be guessed), got ${got}`)
    } else if (Array.isArray(exp)) {
      if (got === null) accuracyErrors.push(`"${name}" expected [${exp[0]}, ${exp[1]}], got null`)
      else if (got < exp[0] || got > exp[1]) accuracyErrors.push(`"${name}" ${got} outside expected [${exp[0]}, ${exp[1]}]`)
    }
  }
  for (const [fn, expFlag] of Object.entries(expected.flags ?? {})) {
    if (!!flags[fn] !== !!expFlag) accuracyErrors.push(`flag ${fn}: expected ${expFlag}, got ${flags[fn]}`)
  }
  if (expected.player_type && playerType !== expected.player_type) {
    accuracyErrors.push(`player_type: expected ${expected.player_type}, got ${playerType}`)
  }
  if (accuracyErrors.length === 0) {
    console.log(`  ✓ ACCURACY overall ${overallMedian} — all expectations met`)
  } else {
    for (const e of accuracyErrors) console.error(`  ✗ ACCURACY ${e}`)
    accuracyFailures += accuracyErrors.length
  }

  // ---- drift vs baseline -----------------------------------------------
  const base = baseline?.fixtures?.[fixture.slug]
  if (base && !ACCEPT) {
    const driftLines = []
    if (typeof base.overall === 'number' && Math.abs(base.overall - overallMedian) > 0.05) {
      const d = overallMedian - base.overall
      driftLines.push(`overall ${base.overall} → ${overallMedian} (${d > 0 ? '+' : ''}${d.toFixed(1)})${Math.abs(d) > DRIFT_THRESHOLD ? '  ◀ DRIFT' : ''}`)
      if (Math.abs(d) > DRIFT_THRESHOLD) regressions++
    }
    for (const [name, prev] of Object.entries(base.criteria ?? {})) {
      const got = criteriaMedians[name]
      if (got === undefined) continue
      if (prev === null && got !== null) { driftLines.push(`"${name}" null → ${got}  ◀ DRIFT (null↔scored)`); regressions++ }
      else if (prev !== null && got === null) { driftLines.push(`"${name}" ${prev} → null  ◀ DRIFT (null↔scored)`); regressions++ }
      else if (prev !== null && got !== null && Math.abs(prev - got) > DRIFT_THRESHOLD) { driftLines.push(`"${name}" ${prev} → ${got}  ◀ DRIFT`); regressions++ }
    }
    for (const [fn, prevFlag] of Object.entries(base.flags ?? {})) {
      if (!!flags[fn] !== !!prevFlag) { driftLines.push(`flag ${fn} ${prevFlag} → ${flags[fn]}  ◀ DRIFT`); regressions++ }
    }
    if (base.player_type && base.player_type !== playerType) { driftLines.push(`player_type ${base.player_type} → ${playerType}  ◀ DRIFT`); regressions++ }
    if (driftLines.length === 0) console.log(`  ✓ BASELINE no drift`)
    else for (const l of driftLines) console.log(`  Δ BASELINE ${l}`)
  } else if (!baseline && !ACCEPT) {
    console.log(`  ⚠ no baseline yet — run with --accept to freeze one`)
  }

  baselineOut[fixture.slug] = {
    shot_detected: true,
    overall: overallMedian,
    criteria: criteriaMedians,
    flags,
    player_type: playerType,
  }
  console.log()
}

// ---- grader identity ----------------------------------------------------
if (graderVersion && baseline?.grader?.prompt_sha && graderVersion.prompt_sha !== baseline.grader.prompt_sha && !ACCEPT) {
  console.log('⚠⚠ GRADER CHANGED since the accepted baseline (prompt_sha differs).')
  console.log(`   baseline: ${baseline.grader.prompt_sha.slice(0, 12)}… (${(baseline.grader.rubric_tags ?? []).join(', ')})`)
  console.log(`   current:  ${graderVersion.prompt_sha.slice(0, 12)}… (${(graderVersion.rubric_tags ?? []).join(', ')})`)
  console.log('   Drift above is expected if you just edited the rubric/calibration — review it, then --accept or revert.\n')
}

if (ACCEPT) {
  // --only would silently drop the other fixtures from the baseline.
  if (ONLY && baseline?.fixtures) Object.assign(baselineOut, { ...baseline.fixtures, ...baselineOut })
  fs.writeFileSync(
    BASELINE_PATH,
    JSON.stringify({ accepted_at: new Date().toISOString(), grader: graderVersion, fixtures: baselineOut }, null, 2) + '\n'
  )
  console.log(`Baseline accepted → ${BASELINE_PATH}`)
  if (accuracyFailures > 0) console.log(`⚠ note: accepted with ${accuracyFailures} accuracy failure(s) still open — expected ranges may need editing.`)
  process.exit(0)
}

console.log(`Done: ${accuracyFailures} accuracy failure(s), ${regressions} baseline drift(s).`)
process.exit(accuracyFailures > 0 || regressions > 0 ? 1 : 0)
