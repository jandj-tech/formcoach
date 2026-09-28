// Does COMPARISON INSTABILITY predict a GRADING MISS?
//
// The comparator curve produced one clean result: the rate at which a pairwise
// verdict flips when you swap presentation order falls monotonically as the
// expert gap widens (25, 21, 18, 13 over four bands). That is what real
// perception looks like from the outside.
//
// This asks the question that actually matters for the product. We have never
// had a working reliability signal: the model's own stated confidence predicts
// misses at r = 0.000, token entropy at r = 0.000, the guard rail caught 0 and
// broke 4, and the big-miss catcher was not reproducible. If a shot whose
// COMPARISONS are unstable is also a shot whose SCORE is wrong, then flip rate
// is the reliability signal — and it needs no ground truth to compute at
// serving time.
//
// Zero new model calls: joins the cached comparisons against a per-cell dump.
//
// Usage: node scripts/eval/flip-predicts-miss.mjs [--dump .eval-arms/cur.json]
import { readFileSync } from 'fs'

const arg = (n, d) => process.argv.find((a, i) => process.argv[i - 1] === n) ?? d
const DUMP = arg('--dump', '.eval-arms/cur.json')
const cache = JSON.parse(readFileSync('.eval-arms/curve-cache.json', 'utf8'))
const dump = JSON.parse(readFileSync(DUMP, 'utf8'))

// Rebuild each pair's two verdicts from the cache.
const pairs = new Map()
for (const [k, v] of Object.entries(cache)) {
  const [criterion, a, b, order] = k.split('|')
  const id = `${criterion}|${a}|${b}`
  const rec = pairs.get(id) ?? { criterion, a, b, AB: undefined, BA: undefined }
  rec[order] = v
  pairs.set(id, rec)
}

// Per (criterion, slug): how often did a comparison involving this shot flip?
const stat = new Map()
const bump = (criterion, slug, flipped) => {
  const key = `${criterion}|${slug}`
  const s = stat.get(key) ?? { flips: 0, n: 0 }
  s.n++; if (flipped) s.flips++
  stat.set(key, s)
}
for (const p of pairs.values()) {
  if (p.AB === undefined || p.BA === undefined) continue
  if (p.AB === null || p.BA === null) continue
  const flipped = p.AB !== p.BA
  bump(p.criterion, p.a, flipped)
  bump(p.criterion, p.b, flipped)
}

// Join against the graded cells.
const rows = []
for (const c of dump.cells) {
  if (c.source !== 'expert' || c.score === null) continue
  const s = stat.get(`${c.criterion}|${c.fixture}`)
  if (!s || s.n < 3) continue           // need a few comparisons to have a rate
  rows.push({ ...c, flipRate: s.flips / s.n, n: s.n })
}

const missed = rows.filter((r) => r.missed)
const hit = rows.filter((r) => !r.missed)
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
const mMiss = mean(missed.map((r) => r.flipRate))
const mHit = mean(hit.map((r) => r.flipRate))

// Point-biserial correlation between flip rate and missed.
const xs = rows.map((r) => r.flipRate), ys = rows.map((r) => (r.missed ? 1 : 0))
const mx = mean(xs), my = mean(ys)
const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0)
const den = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0))
const r = den ? num / den : NaN

// Two-sided permutation test: no distributional assumptions, small n.
let seed = 7, rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const obs = Math.abs(mMiss - mHit)
let ge = 0, ITER = 20000
for (let it = 0; it < ITER; it++) {
  const sh = ys.slice()
  for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]] }
  const a = [], b = []
  for (let i = 0; i < xs.length; i++) (sh[i] ? a : b).push(xs[i])
  if (Math.abs(mean(a) - mean(b)) >= obs) ge++
}

console.log(`dump: ${DUMP}`)
console.log(`cells with >=3 cached comparisons: ${rows.length}  (missed ${missed.length}, hit ${hit.length})\n`)
console.log(`mean flip rate, MISSED cells : ${(100 * mMiss).toFixed(1)}%`)
console.log(`mean flip rate, HIT cells    : ${(100 * mHit).toFixed(1)}%`)
console.log(`difference                   : ${(100 * (mMiss - mHit)).toFixed(1)} points`)
console.log(`point-biserial r             : ${r.toFixed(3)}`)
console.log(`permutation p (two-sided)    : ${((ge + 1) / (ITER + 1)).toFixed(4)}`)
console.log(`\nFor reference, the signals already measured and rejected:`)
console.log(`  model's stated confidence -> miss   r = 0.000`)
console.log(`  token entropy             -> miss   r = 0.000`)
console.log(`\nA difference that does not clear p<0.05 here is NOT a reliability signal,`)
console.log(`however good the monotone flip/gap curve looked.`)
