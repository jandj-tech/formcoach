// Compare two arms HONESTLY: on the fixtures that ran in BOTH, paired per cell.
//
// WHY THIS EXISTS. Two arms in this project were read side by side when they had
// each lost a DIFFERENT fixture — base lost shot-194, tight lost shot-208 — so
// the "comparison" was between two different test sets. run-eval prints an
// ARM NON-COMPARABLE banner for exactly this, but the banner only says the arm
// is damaged; it does not tell you what IS still comparable. Intersecting the
// fixtures recovers a valid paired comparison from two imperfect arms.
//
// Reports the paired McNemar exact test, because the arms grade the SAME cells:
// an unpaired two-proportion test throws away the pairing and needs roughly
// four times the data to see the same effect.
//
// Usage: node scripts/eval/compare-arms.mjs A.json B.json [--labels base,tight]
import { readFileSync } from 'fs'

const [fileA, fileB] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const labelsArg = process.argv.find((a, i) => process.argv[i - 1] === '--labels')
const [LA, LB] = (labelsArg ?? 'A,B').split(',')
const A = JSON.parse(readFileSync(fileA, 'utf8'))
const B = JSON.parse(readFileSync(fileB, 'utf8'))

const expertCells = (d) => d.cells.filter((c) => c.source === 'expert')
const fixturesOf = (d) => new Set(expertCells(d).map((c) => c.fixture))
const fa = fixturesOf(A), fb = fixturesOf(B)
const common = [...fa].filter((f) => fb.has(f)).sort()
const onlyA = [...fa].filter((f) => !fb.has(f))
const onlyB = [...fb].filter((f) => !fa.has(f))

console.log(`${LA}: ${fa.size} fixtures   ${LB}: ${fb.size} fixtures   COMMON: ${common.length}`)
if (onlyA.length) console.log(`  only in ${LA}: ${onlyA.join(', ')}`)
if (onlyB.length) console.log(`  only in ${LB}: ${onlyB.join(', ')}`)
if (common.length < 20) console.log(`  ** ${common.length} common fixtures is a thin base — treat any result as indicative **`)

const key = (c) => `${c.fixture}|${c.criterion}`
const mapA = new Map(expertCells(A).filter((c) => common.includes(c.fixture)).map((c) => [key(c), c]))
const mapB = new Map(expertCells(B).filter((c) => common.includes(c.fixture)).map((c) => [key(c), c]))
const shared = [...mapA.keys()].filter((k) => mapB.has(k))

let aOnly = 0, bOnly = 0, both = 0, neither = 0
const perCrit = {}
for (const k of shared) {
  const ca = mapA.get(k), cb = mapB.get(k)
  const crit = ca.criterion
  perCrit[crit] ??= { n: 0, aMiss: 0, bMiss: 0 }
  perCrit[crit].n++
  if (ca.missed) perCrit[crit].aMiss++
  if (cb.missed) perCrit[crit].bMiss++
  if (ca.missed && !cb.missed) aOnly++          // B fixed it
  else if (!ca.missed && cb.missed) bOnly++     // B broke it
  else if (ca.missed && cb.missed) both++
  else neither++
}
const missA = aOnly + both, missB = bOnly + both
const n = shared.length

// Wilson interval, because a bare percentage is how E42 happened.
function wilson(k, N) {
  if (!N) return [0, 0]
  const z = 1.96, p = k / N, d = 1 + z * z / N
  const c = p + z * z / (2 * N), m = z * Math.sqrt(p * (1 - p) / N + z * z / (4 * N * N))
  return [(c - m) / d, (c + m) / d]
}
// McNemar EXACT (binomial on the discordant pairs) — valid at small counts,
// where the chi-square approximation is not.
function mcnemarExact(b, c) {
  const nD = b + c
  if (nD === 0) return 1
  const lc = (k, N) => { let s = 0; for (let i = 0; i < k; i++) s += Math.log((N - i) / (i + 1)); return s }
  let p = 0
  const target = Math.min(b, c)
  for (let i = 0; i <= target; i++) p += Math.exp(lc(i, nD) - nD * Math.LN2)
  return Math.min(1, 2 * p)
}
const [la, ua] = wilson(missA, n), [lb, ub] = wilson(missB, n)
const p = mcnemarExact(aOnly, bOnly)

console.log(`\nPAIRED on ${n} expert cells across ${common.length} fixtures\n`)
console.log(`${LA.padEnd(8)} miss ${missA}/${n} = ${(100 * missA / n).toFixed(1)}%  CI [${(100 * la).toFixed(1)}, ${(100 * ua).toFixed(1)}]`)
console.log(`${LB.padEnd(8)} miss ${missB}/${n} = ${(100 * missB / n).toFixed(1)}%  CI [${(100 * lb).toFixed(1)}, ${(100 * ub).toFixed(1)}]`)
console.log(`\ndiscordant pairs: ${LB} FIXED ${aOnly}, ${LB} BROKE ${bOnly}  (agreed: ${both} both missed, ${neither} both fine)`)
console.log(`McNemar exact p = ${p.toFixed(4)}   ${p < 0.05 ? '<- SIGNIFICANT' : '<- not significant; the arms are indistinguishable'}`)

console.log(`\nper criterion (n, ${LA} miss -> ${LB} miss):`)
for (const [c, s] of Object.entries(perCrit).sort((x, y) => (y[1].aMiss - y[1].bMiss) - (x[1].aMiss - x[1].bMiss))) {
  const d = s.bMiss - s.aMiss
  console.log(`  ${c.slice(0, 34).padEnd(35)} n=${String(s.n).padStart(2)}  ${String(s.aMiss).padStart(2)} -> ${String(s.bMiss).padStart(2)}  ${d === 0 ? '' : d < 0 ? `${-d} better` : `${d} worse`}`)
}
console.log(`\nWith ~${n} cells this can only see swings of roughly 10 points or more.`)
console.log(`"not significant" here means UNDECIDED, not "no difference".`)
