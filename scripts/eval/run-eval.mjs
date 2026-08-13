// CLI twin of the admin Test Bench (/admin/eval). Same fixtures, same
// baseline, same math — fixtures live in the eval_fixtures table, accepted
// baselines in eval_baselines, and the comparison logic in lib/eval-report.ts.
//
// Usage:
//   npm run eval                     full: 2 runs × default ensemble passes
//   npm run eval:quick               1 run × 1 pass (cheap smoke, no spread)
//   npm run eval -- --only a,b       only these fixture slugs
//   npm run eval -- --runs 3         more repeat runs (better spread estimate)
//   npm run eval -- --accept         freeze this eval as the new baseline
const args = process.argv.slice(2)
const QUICK = args.includes('--quick')
const ACCEPT = args.includes('--accept')
const runsArg = args.indexOf('--runs')
const RUNS = QUICK ? 1 : runsArg !== -1 ? Math.max(1, parseInt(args[runsArg + 1], 10) || 2) : 2
const onlyArg = args.indexOf('--only')
const ONLY = onlyArg !== -1 ? args[onlyArg + 1].split(',').map((s) => s.trim()) : null

const { db } = await import('../../lib/db.ts')
const { runFixtureOnce } = await import('../../lib/eval.ts')
const {
  aggregateRuns,
  checkAccuracy,
  diffBaseline,
  countDrift,
  toBaselineEntry,
  SPREAD_PASS,
  SPREAD_CLOSE,
} = await import('../../lib/eval-report.ts')

let fixtures = await db`
  SELECT id, slug, analysis_id, description, frames_hash, frame_urls, expected, active
  FROM eval_fixtures WHERE active = true ORDER BY slug
`
if (ONLY) fixtures = fixtures.filter((f) => ONLY.includes(f.slug))
if (fixtures.length === 0) {
  console.error(
    ONLY
      ? `No active fixtures match --only ${ONLY.join(',')}`
      : 'No reference shots yet. Add them in the admin Test Bench (/admin/eval) or with scripts/eval/author-fixture.mjs.'
  )
  process.exit(1)
}

const [baseline] = await db`
  SELECT id, grader, results, accepted_at FROM eval_baselines ORDER BY id DESC LIMIT 1
`

const passesDefault = Math.max(1, Math.min(5, parseInt(process.env.ANALYSIS_PASSES || '3', 10) || 3))
console.log(
  `Evaluating ${fixtures.length} fixture(s) × ${RUNS} run(s) × ${QUICK ? 1 : passesDefault} pass(es) ≈ ${fixtures.length * RUNS * (QUICK ? 1 : passesDefault)} model calls\n`
)

let accuracyFailures = 0
let regressions = 0
let grader = null
const newResults = {}

for (const fixture of fixtures) {
  console.log(`── ${fixture.slug} ${'─'.repeat(Math.max(0, 50 - fixture.slug.length))}`)
  const runs = []
  let failed = null
  for (let r = 0; r < RUNS; r++) {
    try {
      runs.push(await runFixtureOnce(fixture, QUICK ? { passes: 1 } : undefined))
    } catch (err) {
      failed = err instanceof Error ? err.message : String(err)
      break
    }
  }
  if (failed || runs.length === 0) {
    console.error(`  ✗ ${failed ?? 'no runs completed'}`)
    accuracyFailures++
    console.log()
    continue
  }

  const summary = aggregateRuns(runs)
  grader = summary.grader ?? grader
  newResults[fixture.slug] = toBaselineEntry(summary)

  if (RUNS > 1 && summary.overall_spread !== null) {
    const grade =
      summary.overall_spread <= SPREAD_PASS ? 'PASS' : summary.overall_spread <= SPREAD_CLOSE ? 'CLOSE' : 'FAIL'
    console.log(
      `  ${grade === 'FAIL' ? '✗' : '✓'} CONSISTENCY overall spread ${summary.overall_spread.toFixed(2)} (${grade}), worst criterion spread ${summary.worst_criterion_spread?.toFixed(2)}`
    )
    for (const issue of summary.consistency_issues) console.log(`    ⚠ ${issue}`)
  }

  const accuracy = checkAccuracy(fixture.expected ?? {}, summary)
  if (accuracy.length === 0) {
    console.log(`  ✓ ACCURACY ${summary.shot_detected ? `overall ${summary.overall}` : 'no shot (as expected)'} — all expectations met`)
  } else {
    for (const e of accuracy) console.error(`  ✗ ACCURACY ${e}`)
    accuracyFailures += accuracy.length
  }

  const drift = diffBaseline(baseline?.results?.[fixture.slug], summary)
  if (baseline && !ACCEPT) {
    if (drift.length === 0) console.log(`  ✓ BASELINE no drift`)
    else for (const l of drift) console.log(`  Δ BASELINE ${l}`)
    regressions += countDrift(drift)
  } else if (!baseline && !ACCEPT) {
    console.log(`  ⚠ no baseline yet — run with --accept to freeze one`)
  }
  console.log()
}

if (grader && baseline?.grader?.prompt_sha && grader.prompt_sha !== baseline.grader.prompt_sha && !ACCEPT) {
  console.log('⚠⚠ GRADER CHANGED since the accepted baseline (prompt_sha differs).')
  console.log(`   baseline: ${baseline.grader.prompt_sha.slice(0, 12)}… (${(baseline.grader.rubric_tags ?? []).join(', ')})`)
  console.log(`   current:  ${grader.prompt_sha.slice(0, 12)}… (${(grader.rubric_tags ?? []).join(', ')})`)
  console.log('   Drift above is the measured effect of rubric edits / new corrections — review, then --accept or revert.\n')
}

if (ACCEPT) {
  // A partial (--only) accept must not drop the untouched fixtures.
  const merged = { ...(baseline?.results ?? {}), ...newResults }
  await db`
    INSERT INTO eval_baselines (grader, results)
    VALUES (${grader ? JSON.stringify(grader) : null}::jsonb, ${JSON.stringify(merged)}::jsonb)
  `
  console.log('Baseline accepted (stored in eval_baselines).')
  if (accuracyFailures > 0) console.log(`⚠ note: accepted with ${accuracyFailures} accuracy failure(s) still open — expected ranges may need editing.`)
  process.exit(0)
}

console.log(`Done: ${accuracyFailures} accuracy failure(s), ${regressions} baseline drift(s).`)
process.exit(accuracyFailures > 0 || regressions > 0 ? 1 : 0)
