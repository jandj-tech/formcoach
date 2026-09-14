// Bulk-imports every analysis the owner has corrected by hand into eval_fixtures.
//
// WHY: at 5 fixtures the eval holds ~56 criterion assertions, and re-running the
// IDENTICAL prompt twice moves the miss count by ±6-7. Measured power at that
// size: a 20%-worse grader is caught 12% of the time, and the minimum
// detectable effect is a 78% relative cut. It cannot see a regression. Every
// corrected analysis still has its frames pinned in storage, so importing them
// is the one lever that fixes this without new labelling work.
//
// WHAT THE IMPORTED CELLS ARE WORTH — this matters more than the count:
//   - a criterion the owner CORRECTED  -> expected.criteria_source = 'expert'.
//     Real ground truth. These are the accuracy signal.
//   - a criterion the owner LEFT ALONE -> 'ai'. Seeded from what the grader
//     itself said, so it is circular: failing one proves grading MOVED, never
//     that grading got worse. run-eval.mjs counts the two separately and only
//     the expert number gates the exit status.
// Roughly 4 in 5 imported cells are 'ai'. Summing them into one "miss rate"
// would drown the real signal — don't.
//
// Skips analyses with no stored frames and anything already a fixture, so it is
// safe to re-run as more corrections come in.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/eval/import-corrected.mjs [--dry-run] [--limit N]

const DRY = process.argv.includes('--dry-run')
const limitIdx = process.argv.indexOf('--limit')
const LIMIT = limitIdx > -1 ? parseInt(process.argv[limitIdx + 1], 10) : Infinity

const { db } = await import('../../lib/db.ts')
const { authorFixtureFromAnalysis } = await import('../../lib/eval.ts')

const candidates = await db`
  SELECT a.id,
         COUNT(*) FILTER (WHERE cs.admin_score IS NOT NULL) AS corrected,
         COUNT(*) AS cells,
         COALESCE(array_length(a.frame_urls, 1), 0) AS frames
  FROM analyses a
  JOIN criterion_scores cs ON cs.analysis_id = a.id
  WHERE NOT EXISTS (SELECT 1 FROM eval_fixtures f WHERE f.analysis_id = a.id)
    AND COALESCE(array_length(a.frame_urls, 1), 0) > 0
  GROUP BY a.id
  HAVING COUNT(*) FILTER (WHERE cs.admin_score IS NOT NULL) > 0
  ORDER BY a.id
`

const todo = candidates.slice(0, LIMIT)
if (todo.length === 0) {
  console.log('Nothing to import — every corrected analysis with frames is already a fixture.')
  process.exit(0)
}

const totalCells = todo.reduce((n, r) => n + Number(r.cells), 0)
const totalExpert = todo.reduce((n, r) => n + Number(r.corrected), 0)
console.log(
  `${todo.length} analysis/analyses to import: ${totalCells} criterion cells` +
    ` (${totalExpert} expert, ${totalCells - totalExpert} ai-seeded)\n`
)

if (DRY) {
  for (const r of todo) {
    console.log(`  shot-${r.id}: ${r.cells} cells, ${r.corrected} corrected, ${r.frames} frames`)
  }
  console.log('\n--dry-run — nothing written.')
  process.exit(0)
}

let ok = 0
const failures = []
for (const r of todo) {
  const slug = `shot-${r.id}`
  try {
    // derivedExpectations:false — no overall/flags/player_type assertions.
    // Nobody hand-tightens a bulk import, and overall is just the weighted mean
    // of the criteria, so asserting it inside a ±0.5 band double-counts the
    // criteria and fires on noise.
    const f = await authorFixtureFromAnalysis(r.id, slug, { derivedExpectations: false })
    ok++
    console.log(`  ✓ ${slug} (fixture ${f.id}) — ${r.corrected}/${r.cells} expert`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    failures.push(`${slug}: ${msg}`)
    console.error(`  ✗ ${slug} — ${msg}`)
  }
}

const [{ count: fixtureCount }] = await db`SELECT COUNT(*) AS count FROM eval_fixtures WHERE active = true`
console.log(`\nImported ${ok}/${todo.length}. Active fixtures now: ${fixtureCount}.`)
if (failures.length > 0) {
  console.log(`${failures.length} failed:`)
  for (const f of failures) console.log(`  - ${f}`)
}
console.log('\nNext: npm run eval -- --quick   (expect ai-seeded movement; watch the EXPERT number)')
process.exit(failures.length > 0 ? 1 : 0)
