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
// --dump <file> writes every asserted cell's score as JSON, passes included.
const dumpArg = args.indexOf('--dump')
const DUMP = dumpArg !== -1 ? args[dumpArg + 1] : null
const dumpRows = []

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
  AI_SEEDED_PREFIX,
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

const passesDefault = Math.max(1, Math.min(9, parseInt(process.env.ANALYSIS_PASSES || '3', 10) || 3))
console.log(
  `Evaluating ${fixtures.length} fixture(s) × ${RUNS} run(s) × ${QUICK ? 1 : passesDefault} pass(es) ≈ ${fixtures.length * RUNS * (QUICK ? 1 : passesDefault)} model calls\n`
)

// Two populations, deliberately never summed. `expert` cells are ranges the
// owner set by hand and are the only measure of ACCURACY. `aiSeeded` cells were
// prefilled from what the grader itself said on an imported analysis: failing
// one means grading MOVED, which is worth seeing, but it cannot show grading
// got worse — the range it is measured against is the old grader's own output.
let expertFailures = 0
let aiSeededFailures = 0
// Fixtures that never produced a result at all — a thrown error, a gateway
// refusal, a truncated response. Counted SEPARATELY and never folded into the
// accuracy number: a model that dies on every fixture otherwise reports the
// same "5 failures" as a model that merely graded them slightly wrong, and
// reads as the better of the two. That has faked a model bake-off before.
let runFailures = 0
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
    console.error(`  ✗ DID NOT RUN — ${failed ?? 'no runs completed'}`)
    runFailures++
    console.log()
    continue
  }

  const summary = aggregateRuns(runs)
  grader = summary.grader ?? grader
  newResults[fixture.slug] = toBaselineEntry(summary)

  // --dump writes EVERY cell's score, not just the ones that missed.
  //
  // The console output prints failures only, which is fine for reading a run
  // and useless for analysis: any statistic computed from it — a per-criterion
  // bias offset, most obviously — is conditioned on having missed, so it is
  // biased by construction. Fitting an offset on misses alone would overstate
  // every offset it found.
  if (DUMP) {
    const expected = fixture.expected ?? {}
    for (const [name, score] of Object.entries(summary.criteria)) {
      const exp = expected.criteria?.[name]
      if (exp === undefined) continue // criterion the fixture makes no claim about
      dumpRows.push({
        fixture: fixture.slug,
        criterion: name,
        score,
        expected: exp,
        source: expected.criteria_source?.[name] ?? 'expert',
        missed:
          exp === 'null'
            ? score !== null
            : score === null || score < exp[0] || score > exp[1],
      })
    }
  }

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
    for (const e of accuracy) {
      const seeded = e.startsWith(AI_SEEDED_PREFIX)
      if (seeded) aiSeededFailures++
      else expertFailures++
      console.error(`  ${seeded ? '·' : '✗'} ACCURACY ${e}`)
    }
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
  if (expertFailures + aiSeededFailures > 0) {
    console.log(
      `⚠ note: accepted with ${expertFailures} expert + ${aiSeededFailures} ai-seeded failure(s) still open — expected ranges may need editing.`
    )
  }
  process.exit(0)
}

console.log(
  `Done: ${expertFailures} EXPERT accuracy failure(s)` +
    ` · ${aiSeededFailures} ai-seeded movement(s)` +
    ` · ${regressions} baseline drift(s)` +
    ` · ${runFailures} fixture(s) DID NOT RUN.`
)
if (runFailures > 0) {
  console.log(
    `⚠ ${runFailures} fixture(s) produced no result — the accuracy numbers above` +
      ` cover only the ${fixtures.length - runFailures} that ran. Fix these before comparing anything.`
  )
}
console.log(
  'Only the EXPERT number measures accuracy. ai-seeded cells are scored against' +
    ' the old grader\'s own output, so they show change, not correctness.'
)
if (DUMP) {
  const { writeFileSync } = await import('fs')
  writeFileSync(
    DUMP,
    JSON.stringify(
      {
        grader,
        model: grader?.model ?? null,
        passes: grader?.passes ?? null,
        env: {
          ANALYSIS_MODEL: process.env.ANALYSIS_MODEL ?? null,
          RUBRIC_OVERRIDE: process.env.RUBRIC_OVERRIDE ?? null,
          CRITERION_GROUPS: process.env.CRITERION_GROUPS ?? null,
          GATEWAY_REASONING: process.env.GATEWAY_REASONING ?? null,
        },
        ranFixtures: fixtures.length - runFailures,
        lostFixtures: runFailures,
        cells: dumpRows,
      },
      null,
      1
    )
  )
  console.log(`\nwrote ${dumpRows.length} cell results to ${DUMP}`)
}

// Exit status tracks expert failures and baseline drift. ai-seeded movement is
// reported but does not fail the run: a deliberate grading change would make
// every imported fixture "fail" and there would be no way to land it.
process.exit(expertFailures > 0 || regressions > 0 || runFailures > 0 ? 1 : 0)
