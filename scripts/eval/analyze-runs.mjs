// Turns run-eval output files into a per-cell dataset and reports what the
// numbers actually support.
//
// WHY THIS EXISTS: a run prints only its FAILURES, so "47 failures" is
// uninterpretable on its own — it depends on how many fixtures survived and how
// many cells each asserts. Comparing two arms by their totals has produced two
// false results already: an arm that lost 25 of 28 fixtures reported "8
// failures" and read as a triumph, and a rubric that flipped every score from
// too-high to too-low moved the total by 3 and read as no change.
//
// So every number here is derived from cells, not from run totals:
//   cell        = (fixture, criterion) that a fixture actually asserts
//   population  = expert cells (the owner's own labels) vs ai-seeded (circular)
//   outcome     = fail if the run printed it, pass if the fixture ran and did
//                 not print it, absent if the fixture did not run
//
// Usage:
//   npx tsx --env-file=.env.local scripts/eval/analyze-runs.mjs <run.txt>...
//   npx tsx --env-file=.env.local scripts/eval/analyze-runs.mjs --criteria <run.txt>...
import { readFileSync } from 'fs'
import { basename } from 'path'

const args = process.argv.slice(2)
const BY_CRITERION = args.includes('--criteria')
const files = args.filter((a) => !a.startsWith('--'))

/**
 * Grace band outside the expected range, in points, set by the owner
 * (2026-09-15): a score within this much of the band is close enough to be
 * correct for a player-facing grade.
 *
 * BOTH numbers are always reported — strict and tolerant — and the strict one
 * stays first. A tolerance is a legitimate product specification about what
 * "correct" means, but it is also the easiest way in the world to manufacture
 * an improvement, so it does not get to quietly replace the original metric.
 * 13% of observed misses sit within 0.5 points of the band, so this is worth
 * real cells and the difference should be visible, not absorbed.
 */
const TOLERANCE = Number(process.env.EVAL_TOLERANCE ?? '0.3') || 0
if (files.length === 0) {
  console.error('usage: analyze-runs.mjs [--criteria] <run.txt>...')
  process.exit(1)
}

/**
 * The only three criteria a player's report is allowed to hide.
 *
 * Product decision, not a measurement one: arc, rotation and the fingers at
 * release are genuinely invisible at the framing most clips have, so hiding
 * them is honest where guessing is not. Everything else MUST come back with a
 * score — a player is entitled to know what their elbow and their base looked
 * like — so the target miss rate is computed over MUST-SCORE criteria only,
 * and abstaining on one of those is counted as a miss rather than excused.
 */
const ABSTAIN_OK = new Set(['Two Finger Release', 'Shot Arc', 'Ball Rotation'])

const { db } = await import('../../lib/db.ts')

/** Every cell the suite asserts, with its provenance. */
const fixtures = await db`
  SELECT slug, expected FROM eval_fixtures WHERE active = true ORDER BY slug
`
const cells = new Map() // "slug|criterion" -> 'expert' | 'ai'
const cellsByFixture = new Map()
for (const row of fixtures) {
  const e = typeof row.expected === 'string' ? JSON.parse(row.expected) : row.expected
  const src = e.criteria_source ?? {}
  const list = []
  for (const name of Object.keys(e.criteria ?? {})) {
    const key = `${row.slug}|${name}`
    cells.set(key, src[name] === 'ai' ? 'ai' : 'expert')
    list.push(key)
  }
  cellsByFixture.set(row.slug, list)
}
const expertCells = [...cells.keys()].filter((k) => cells.get(k) === 'expert')
await db.end()

/** Parse one run file -> { ran:Set, lost:Set, failed:Set } */
function parseRun(path) {
  const ran = new Set()
  const lost = new Set()
  const failed = new Set()
  const margin = new Map()
  let cur = null
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.startsWith('Done:') || line.startsWith('⚠')) {
      cur = null
      continue
    }
    const h = line.match(/^── (\S+)/)
    if (h) {
      cur = h[1]
      ran.add(cur)
      continue
    }
    if (!cur) continue
    if (line.includes('✗ DID NOT RUN')) {
      lost.add(cur)
      continue
    }
    // Both markers are failures; '·' is the ai-seeded prefix, '✗' the expert one.
    const m = line.match(/[✗·] ACCURACY (?:\[ai-seeded\] )?"([^"]+)"/)
    if (!m) continue
    const key = `${cur}|${m[1]}`
    failed.add(key)
    // A numeric miss also records HOW FAR outside, so the tolerant count can be
    // recomputed from the same output rather than needing a fresh run.
    const num = line.match(/"[^"]+" ([\d.]+) outside expected \[([\d.]+), ([\d.]+)\]/)
    if (num) {
      const s = +num[1], lo = +num[2], hi = +num[3]
      margin.set(key, s > hi ? s - hi : lo - s)
    }
  }
  for (const s of lost) ran.delete(s)
  return { ran, lost, failed, margin }
}

/** Wilson score interval — correct at small n and near 0, unlike normal approx. */
function wilson(k, n, z = 1.96) {
  if (n === 0) return [0, 1]
  const p = k / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [Math.max(0, (c - s) / d), Math.min(1, (c + s) / d)]
}

const pct = (x) => `${(x * 100).toFixed(1)}%`

const runs = files.map((f) => ({ name: basename(f, '.txt'), path: f, ...parseRun(f) }))

console.log(`suite: ${fixtures.length} fixtures, ${cells.size} asserted cells `
  + `(${expertCells.length} expert, ${cells.size - expertCells.length} ai-seeded)\n`)

const mustScoreCells = expertCells.filter((k) => !ABSTAIN_OK.has(k.split('|')[1]))
const abstainCells = expertCells.filter((k) => ABSTAIN_OK.has(k.split('|')[1]))

console.log(`MUST-SCORE criteria — the target metric. ${mustScoreCells.length} expert cells`)
console.log(`(excludes ${abstainCells.length} cells on ${[...ABSTAIN_OK].join(', ')},`)
console.log(` which are allowed to be hidden; reported separately below)\n`)
console.log(`${'run'.padEnd(22)}${'lost'.padStart(5)}${'cells'.padStart(6)}` +
  `${'STRICT'.padStart(9)}${'95% CI'.padStart(17)}` +
  `${`+${TOLERANCE} GRACE`.padStart(13)}${'vs 5%'.padStart(14)}`)
for (const r of runs) {
  const scope = mustScoreCells.filter((k) => r.ran.has(k.split('|')[0]))
  const failedKeys = scope.filter((k) => r.failed.has(k))
  const miss = failedKeys.length
  // A cell with no recorded margin was an abstention or a rename, not a numeric
  // near-miss, so grace cannot rescue it.
  const tolMiss = failedKeys.filter((k) => !(r.margin.get(k) <= TOLERANCE)).length
  const [lo, hi] = wilson(miss, scope.length)
  const [tlo, thi] = wilson(tolMiss, scope.length)
  const verdict = thi < 0.05 ? 'MET' : tlo > 0.05 ? 'NOT MET' : 'inconclusive'
  console.log(
    `${r.name.padEnd(22)}${String(r.lost.size).padStart(5)}${String(scope.length).padStart(6)}` +
    `${`${miss} ${pct(miss / (scope.length || 1))}`.padStart(9)}` +
    `${`[${pct(lo)}, ${pct(hi)}]`.padStart(17)}` +
    `${`${tolMiss} ${pct(tolMiss / (scope.length || 1))}`.padStart(13)}` +
    `${verdict.padStart(14)}`
  )
}
console.log(`  STRICT = outside the expected band at all. GRACE = allows ${TOLERANCE} points of slack`)
console.log('  (owner spec 2026-09-15). The "vs 5%" verdict is judged on the GRACE column.')

console.log('\nABSTAIN-OK criteria — hiding these is the correct answer, not a miss')
console.log(`${'run'.padEnd(24)}${'cells'.padStart(7)}${'miss'.padStart(6)}${'rate'.padStart(8)}`)
for (const r of runs) {
  const scope = abstainCells.filter((k) => r.ran.has(k.split('|')[0]))
  const miss = scope.filter((k) => r.failed.has(k)).length
  console.log(
    `${r.name.padEnd(24)}${String(scope.length).padStart(7)}${String(miss).padStart(6)}` +
    `${pct(miss / (scope.length || 1)).padStart(8)}`
  )
}
console.log('  (a miss here means the fixture expected a SCORE and the run hid it,')
console.log('   or expected it hidden and the run scored it anyway)')

// ── Repeatability: cells measured by 2+ runs that ran the same fixture ───────
if (runs.length >= 2) {
  console.log('\nPAIRWISE CELL DISAGREEMENT — how often two runs differ on the same cell')
  console.log(`${'pair'.padEnd(44)}${'cells'.padStart(7)}${'flips'.padStart(7)}${'rate'.padStart(8)}`)
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i], b = runs[j]
      const scope = expertCells.filter((k) => {
        const s = k.split('|')[0]
        return a.ran.has(s) && b.ran.has(s)
      })
      const flips = scope.filter((k) => a.failed.has(k) !== b.failed.has(k)).length
      if (scope.length === 0) continue
      console.log(
        `${`${a.name} vs ${b.name}`.slice(0, 43).padEnd(44)}${String(scope.length).padStart(7)}` +
        `${String(flips).padStart(7)}${pct(flips / scope.length).padStart(8)}`
      )
    }
  }
}

// ── Per-cell agreement across all runs: the reliability signal ───────────────
console.log('\nPER-CELL CONSISTENCY across all supplied runs (expert cells)')
const tally = new Map()
for (const k of expertCells) {
  let n = 0, f = 0
  for (const r of runs) {
    if (!r.ran.has(k.split('|')[0])) continue
    n++
    if (r.failed.has(k)) f++
  }
  if (n >= 2) tally.set(k, { n, f })
}
const always = [...tally.values()].filter((v) => v.f === v.n).length
const never = [...tally.values()].filter((v) => v.f === 0).length
const sometimes = tally.size - always - never
console.log(`  cells measured 2+ times : ${tally.size}`)
console.log(`  ALWAYS missed           : ${always}  (${pct(always / tally.size)})  <- real error, fixable by the algorithm`)
console.log(`  NEVER missed            : ${never}  (${pct(never / tally.size)})  <- reliably correct`)
console.log(`  SOMETIMES missed        : ${sometimes}  (${pct(sometimes / tally.size)})  <- coin-flips; the irreducible part`)
console.log(`\n  => a single run's miss rate is roughly ALWAYS + half of SOMETIMES`)
console.log(`     floor if every coin-flip were resolved: ${pct(always / tally.size)}`)

if (BY_CRITERION) {
  console.log('\nPER-CRITERION — pooled over all runs, expert cells only')
  console.log(`${'criterion'.padEnd(48)}${'n'.padStart(5)}${'miss'.padStart(6)}${'rate'.padStart(8)}   95% CI`)
  const byCrit = new Map()
  for (const k of expertCells) {
    const name = k.split('|')[1]
    for (const r of runs) {
      if (!r.ran.has(k.split('|')[0])) continue
      const e = byCrit.get(name) ?? { n: 0, f: 0 }
      e.n++
      if (r.failed.has(k)) e.f++
      byCrit.set(name, e)
    }
  }
  for (const [name, e] of [...byCrit.entries()].sort((a, b) => b[1].f / b[1].n - a[1].f / a[1].n)) {
    const [lo, hi] = wilson(e.f, e.n)
    console.log(
      `${name.slice(0, 47).padEnd(48)}${String(e.n).padStart(5)}${String(e.f).padStart(6)}` +
      `${pct(e.f / e.n).padStart(8)}   [${pct(lo)}, ${pct(hi)}]`
    )
  }
}
