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

// The fixture list is the first thing an arm touches, and the 9-pass ladder
// arm died right here on a DNS outage without grading a single clip. Waiting
// is strictly better than losing a queued arm.
let fixtures = null
for (let attempt = 1; attempt <= 5 && fixtures === null; attempt++) {
  try {
    fixtures = await db`
      SELECT id, slug, analysis_id, description, frames_hash, frame_urls, expected, active
      FROM eval_fixtures WHERE active = true ORDER BY slug
    `
  } catch (err) {
    if (attempt === 5) throw err
    const wait = 30_000 * attempt
    console.error(`  … cannot reach the fixture DB (${err.message}); retrying in ${wait / 1000}s`)
    await new Promise((r) => setTimeout(r, wait))
  }
}
if (ONLY) fixtures = fixtures.filter((f) => ONLY.includes(f.slug))
// Anchors are shown to the model as graded examples, so scoring them would be
// marking its own reference material. Hold them out entirely.
const ANCHOR_SLUGS = (process.env.ANCHOR_SLUGS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
if (ANCHOR_SLUGS.length > 0) {
  const before = fixtures.length
  fixtures = fixtures.filter((f) => !ANCHOR_SLUGS.includes(f.slug))
  console.log(`Holding ${before - fixtures.length} anchor fixture(s) out of scoring: ${ANCHOR_SLUGS.join(', ')}`)
  console.log('This arm is therefore NOT cell-comparable to an arm without anchors — compare on shared cells only.\n')
}
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

// A fixture lost to a dropped wifi connection is not a measurement — and it
// does not only cost itself. Every arm has to be scored on the SAME suite to
// be comparable, so one lost fixture quietly invalidates the comparison the
// whole arm exists to make. An overnight 3/6/9-pass ladder was destroyed this
// way: the 6-pass arm lost all 28 fixtures to ENOTFOUND/EHOSTUNREACH and
// still printed "0 EXPERT accuracy failure(s)", which reads as a clean sweep.
//
// So transport failures get the fixture put back on the queue rather than
// written off. Model-side failures (a refusal, unparseable JSON, a rubric that
// does not resolve) are NOT retried: those are real findings and hiding them
// behind a retry is exactly the kind of test-gaming this suite is meant to
// catch.
const TRANSPORT = /ENOTFOUND|ECONNRESET|EHOSTUNREACH|ETIMEDOUT|ENETDOWN|ENETUNREACH|EAI_AGAIN|socket hang up|fetch failed|aborted due to timeout|gateway unreachable|terminated/i
const FIXTURE_ATTEMPTS = Number(process.env.EVAL_FIXTURE_ATTEMPTS ?? 3)

/** Grade one fixture, retrying only transport failures. No console output: it
 *  runs interleaved with other fixtures, so anything printed here would arrive
 *  out of order. Reporting happens in fixture order once grading is done. */
async function gradeFixture(fixture) {
  // Completed runs are KEPT across attempts. The previous version reset
  // `runs = []` on every attempt, so one transport failure on run 3 threw
  // away runs 1 and 2 and re-graded them. Over an overnight outage with
  // ~160 failures per arm that re-graded the same fixtures dozens of times
  // and cost about $8 for nothing. Now a failure only redoes the run that
  // failed.
  const runs = []
  let failed = null
  for (let attempt = 1; attempt <= FIXTURE_ATTEMPTS; attempt++) {
    failed = null
    while (runs.length < RUNS) {
      try {
        runs.push(await runFixtureOnce(fixture, QUICK ? { passes: 1 } : undefined))
      } catch (err) {
        failed = err instanceof Error ? err.message : String(err)
        break
      }
    }
    if (!failed && runs.length === RUNS) return { runs, failed: null }
    if (!TRANSPORT.test(failed ?? '')) break
    if (attempt < FIXTURE_ATTEMPTS) {
      // Long waits: a wifi drop or a DNS outage lasts minutes, not seconds,
      // and an arm is already hours long. 30s, then 2m, then 5m thereafter.
      // An arm that dies on a 20-minute outage has thrown away hours of
      // grading, which is strictly worse than sitting still and waiting: the
      // calls cost money, the wall-clock is the binding constraint on this
      // whole effort, and a half-finished arm is not comparable to anything.
      const wait = attempt === 1 ? 30_000 : attempt === 2 ? 120_000 : 300_000
      console.error(`  … ${fixture.slug}: transport failure (attempt ${attempt}/${FIXTURE_ATTEMPTS}): ${failed}`)
      console.error(`  … waiting ${wait / 1000}s for the network before retrying`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  return { runs, failed: failed ?? 'no runs completed' }
}

// Fixture-level concurrency. Iteration speed is the binding constraint on this
// whole effort: at ~3.5 min per fixture an arm is ~100 min, which is how many
// rubric experiments fit in a day. Fixtures are independent, temperature is
// pinned to 0, and frames now come from the on-disk cache, so grading several
// at once changes throughput and not results — the one shared resource is the
// provider, and a 429 is already retried inside fetchWithRetry.
//
// Defaults to 1 (fully serial, identical to before) so that no existing
// comparison silently changes its conditions. Raise it deliberately.
const FIXTURE_CONCURRENCY = Math.max(1, Number(process.env.EVAL_FIXTURE_CONCURRENCY ?? 1))
const graded = new Map()
if (FIXTURE_CONCURRENCY > 1) {
  console.log(`Grading ${fixtures.length} fixture(s) ${FIXTURE_CONCURRENCY} at a time\n`)
}
{
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < fixtures.length) {
      const fixture = fixtures[next++]
      graded.set(fixture.slug, await gradeFixture(fixture))
      done++
      if (FIXTURE_CONCURRENCY > 1) {
        console.log(`  … ${done}/${fixtures.length} graded (${fixture.slug})`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(FIXTURE_CONCURRENCY, fixtures.length) }, worker))
}
if (FIXTURE_CONCURRENCY > 1) console.log()

for (const fixture of fixtures) {
  console.log(`── ${fixture.slug} ${'─'.repeat(Math.max(0, 50 - fixture.slug.length))}`)
  const { runs, failed } = graded.get(fixture.slug) ?? { runs: [], failed: 'not graded' }
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
        evidence: summary.evidence?.[name] ?? null,
        // SETPOINT_CHECK arms: which frame was inspected and what it found.
        // Taken from run 1; the check is deterministic on identical frames.
        // Every run's verdict, not run 1's: byte-identical clips diverge on
        // this model at temperature 0 (E16/E35), so agreement is data.
        set_point: runs.map((r) => r.set_point?.verdict ?? null),
        set_point_frame: runs.map((r) => r.set_point?.frame ?? null),
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

if (process.env.SETPOINT_CHECK === '1') {
  const all = [...graded.values()].flatMap((g) => g.runs ?? [])
  const byVerdict = {}
  for (const r of all) { const v = r.set_point?.verdict ?? 'unavailable'; byVerdict[v] = (byVerdict[v] ?? 0) + 1 }
  console.log(`\nSET-POINT CHECK verdicts across ${all.length} run(s):`, byVerdict)
  if (byVerdict.unavailable) console.log(`*** ARM PARTIALLY CHECKED: ${byVerdict.unavailable} run(s) had no usable check and graded as baseline. ***`)
}
console.log(
  `Done: ${expertFailures} EXPERT accuracy failure(s)` +
    ` · ${aiSeededFailures} ai-seeded movement(s)` +
    ` · ${regressions} baseline drift(s)` +
    ` · ${runFailures} fixture(s) DID NOT RUN.`
)
if (runFailures > 0) {
  // An arm measured on a smaller suite is not a worse measurement, it is a
  // different one, and "0 failures out of 0 fixtures" reads as a clean sweep.
  // That exact line was printed by a 6-pass arm that had lost all 28 clips.
  const ran = fixtures.length - runFailures
  console.log(
    `\n${'='.repeat(64)}\n` +
      `ARM NON-COMPARABLE — ${runFailures} of ${fixtures.length} fixture(s) produced no result.\n` +
      `The accuracy numbers above cover only the ${ran} that ran, so they CANNOT be\n` +
      `compared against any other arm. Fix the losses and re-run before quoting a rate.\n` +
      `${'='.repeat(64)}`
  )
  if (ran === 0) {
    console.error('Every fixture was lost — there is no measurement here at all.')
  }
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
          SETPOINT_CHECK: process.env.SETPOINT_CHECK ?? null,
          SPLIT_FRAMES: process.env.SPLIT_FRAMES ?? null,
          ANCHORS: process.env.ANCHORS ?? null,
          FAULT_GATE: process.env.FAULT_GATE ?? null,
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
