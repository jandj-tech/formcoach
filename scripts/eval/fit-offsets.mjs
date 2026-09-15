// Fits per-criterion bias offsets on a TRAIN split and scores them on a
// held-out TEST split.
//
// WHAT PROBLEM THIS ADDRESSES: several criteria miss in one direction only.
// "Knees Bent" misses 87.5% of the time and every single one is too LOW —
// scoring 4 to 6 against an expected 7 to 10. That is a constant offset, not
// noise, and no amount of rubric wording has moved it.
//
// WHY NOT THE EXISTING CALIBRATION BLOCK: that feature derives directives from
// individual admin corrections, and it was emitting "be 3.0 pts more generous"
// off a SINGLE correction — a coin flip dressed as a measurement. Raising its
// gate to n>=5 emptied it entirely. This fits the same kind of correction from
// 129 expert cells across multiple runs instead, which is two orders of
// magnitude more evidence, and it holds out data to check the fit generalises.
//
// WHY A SPLIT IS MANDATORY: with 28 fixtures it is trivial to fit offsets that
// look excellent on the data they were fitted to and do nothing on new shots.
// The split is deterministic (by slug), so TRAIN and TEST do not drift between
// invocations and results stay comparable.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/eval/fit-offsets.mjs <dump.json>...
import { readFileSync, writeFileSync } from 'fs'

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const WRITE = process.argv.includes('--write')
if (files.length === 0) {
  console.error('usage: fit-offsets.mjs [--write] <dump.json>...')
  process.exit(1)
}

/** Deterministic split by slug so TRAIN/TEST never drift between runs. */
function isTrain(slug) {
  let h = 0
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) % 100000
  return h % 2 === 0
}

const rows = []
for (const f of files) {
  const d = JSON.parse(readFileSync(f, 'utf8'))
  for (const c of d.cells) {
    if (c.source !== 'expert') continue // ai-seeded cells are circular
    if (c.expected === 'null') continue // an abstention target, not a number
    if (c.score === null) continue // no score to measure an offset against
    const [lo, hi] = c.expected
    rows.push({
      ...c,
      mid: (lo + hi) / 2,
      err: c.score - (lo + hi) / 2,
      train: isTrain(c.fixture),
    })
  }
}
if (rows.length === 0) {
  console.error('no scored expert cells in those dumps')
  process.exit(1)
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const fixtures = new Set(rows.map((r) => r.fixture))
const trainFx = [...fixtures].filter(isTrain)
console.log(`${rows.length} scored expert cells from ${files.length} run(s), ${fixtures.length ?? fixtures.size} fixtures`)
console.log(`TRAIN ${trainFx.length} fixtures / TEST ${fixtures.size - trainFx.length} fixtures\n`)

// ── Fit on TRAIN only ────────────────────────────────────────────────────────
// Median, not mean: one wildly wrong cell should not set a criterion's offset.
// MIN_N guards against fitting a constant to two observations, and MIN_SHIFT
// keeps offsets that are smaller than the rounding on a 1-10 scale out.
const MIN_N = 6
const MIN_SHIFT = 0.75
const offsets = {}
const byCrit = new Map()
for (const r of rows) {
  if (!r.train) continue
  const e = byCrit.get(r.criterion) ?? []
  e.push(r.err)
  byCrit.set(r.criterion, e)
}
console.log('FIT ON TRAIN — signed error vs the middle of the expected band')
console.log(`${'criterion'.padEnd(46)}${'n'.padStart(4)}${'median err'.padStart(12)}${'offset'.padStart(9)}`)
for (const [name, errs] of [...byCrit.entries()].sort((a, b) => Math.abs(median(b[1])) - Math.abs(median(a[1])))) {
  const m = median(errs)
  const applied = errs.length >= MIN_N && Math.abs(m) >= MIN_SHIFT ? -Math.round(m * 2) / 2 : 0
  if (applied !== 0) offsets[name] = applied
  console.log(
    `${name.slice(0, 45).padEnd(46)}${String(errs.length).padStart(4)}${m.toFixed(2).padStart(12)}` +
    `${(applied ? (applied > 0 ? '+' : '') + applied : '—').padStart(9)}`
  )
}
console.log(`\n${Object.keys(offsets).length} offset(s) qualify (n >= ${MIN_N}, |median| >= ${MIN_SHIFT})`)

// ── Score on TEST, which the fit never saw ───────────────────────────────────
function missRate(scope, withOffsets) {
  let miss = 0
  for (const r of scope) {
    const s = withOffsets ? r.score + (offsets[r.criterion] ?? 0) : r.score
    const [lo, hi] = r.expected
    if (s < lo || s > hi) miss++
  }
  return { miss, n: scope.length, rate: scope.length ? miss / scope.length : 0 }
}
const pct = (x) => `${(x * 100).toFixed(1)}%`
console.log('\nEFFECT — scored cells only (abstentions are a separate failure mode)')
console.log(`${'split'.padEnd(10)}${'cells'.padStart(7)}${'before'.padStart(9)}${'after'.padStart(9)}${'change'.padStart(9)}`)
for (const [label, scope] of [
  ['TRAIN', rows.filter((r) => r.train)],
  ['TEST', rows.filter((r) => !r.train)],
]) {
  const b = missRate(scope, false)
  const a = missRate(scope, true)
  console.log(
    `${label.padEnd(10)}${String(scope.length).padStart(7)}${pct(b.rate).padStart(9)}${pct(a.rate).padStart(9)}` +
    `${(a.miss - b.miss >= 0 ? '+' : '') + (a.miss - b.miss)}`.padStart(9)
  )
}
console.log('\nTRAIN is the fit talking to itself. Only the TEST row is evidence.')

if (WRITE) {
  const out = 'lib/criterion-offsets.json'
  writeFileSync(out, JSON.stringify({ fittedAt: new Date().toISOString(), minN: MIN_N, minShift: MIN_SHIFT, trainFixtures: trainFx.sort(), offsets }, null, 2))
  console.log(`\nwrote ${out}`)
}
