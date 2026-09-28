// Per-criterion miss report: rate, average miss size, worst single miss, and the
// shot behind it. The three numbers the owner asks for, in one command.
//
// Usage: npx tsx scripts/eval/miss-report.mjs <dump.json> [--all]
//        default lists criteria with a miss rate at or above 30%; --all shows every one.
import { readFileSync } from 'fs'

const TOL = Number(process.env.EVAL_TOLERANCE ?? '0.3') || 0
const ABST = new Set(['Two Finger Release', 'Shot Arc', 'Ball Rotation'])
const file = process.argv[2]
const showAll = process.argv.includes('--all')
const d = JSON.parse(readFileSync(file, 'utf8'))
const err = (c) => (c.score < c.expected[0] ? c.score - c.expected[0] : c.score > c.expected[1] ? c.score - c.expected[1] : 0)

const cells = d.cells.filter(
  (c) => c.source === 'expert' && !ABST.has(c.criterion) && Array.isArray(c.expected) && c.score != null
)
const by = new Map()
for (const c of cells) {
  if (!by.has(c.criterion)) by.set(c.criterion, [])
  by.get(c.criterion).push(c)
}
const rows = [...by.entries()].map(([k, cs]) => {
  const missed = cs.filter((c) => Math.abs(err(c)) > TOL)
  const worst = missed.reduce((a, c) => (Math.abs(err(c)) > Math.abs(err(a)) ? c : a), missed[0] ?? null)
  return {
    k, n: cs.length, m: missed.length, rate: missed.length / cs.length,
    avg: missed.length ? missed.reduce((a, c) => a + Math.abs(err(c)), 0) / missed.length : 0,
    worst, worstOff: worst ? err(worst) : 0,
  }
}).sort((a, b) => b.rate - a.rate)

const tot = cells.length
const totM = cells.filter((c) => Math.abs(err(c)) > TOL).length
const wil = (k, n) => { const z = 1.96, p = k / n, D = 1 + z * z / n, c = p + z * z / (2 * n),
  e = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [100 * (c - e) / D, 100 * (c + e) / D] }
const [lo, hi] = wil(totM, tot)
console.log(`\n${file}   ${d.ranFixtures} fixtures ran, ${d.lostFixtures} lost   RUBRIC_OVERRIDE=${d.env?.RUBRIC_OVERRIDE ?? '(none)'}`)
console.log(`OVERALL: ${totM}/${tot} = ${(100 * totM / tot).toFixed(1)}%   CI95 [${lo.toFixed(1)}, ${hi.toFixed(1)}]   tolerance ${TOL}\n`)

const shown = showAll ? rows : rows.filter((r) => r.rate >= 0.3)
console.log('criterion'.padEnd(34) + 'miss'.padStart(9) + 'rate'.padStart(7) + 'avg miss'.padStart(10) + 'worst'.padStart(8) + '   worst case')
for (const r of shown) {
  const w = r.worst
    ? `${r.worst.fixture} expected [${r.worst.expected[0]}, ${r.worst.expected[1]}] got ${r.worst.score}${r.worstOff < 0 ? '  TOO LOW' : '  TOO HIGH'}`
    : '—'
  console.log(
    '  ' + r.k.slice(0, 31).padEnd(32) + `${r.m}/${r.n}`.padStart(8) +
    `${(100 * r.rate).toFixed(0)}%`.padStart(7) + (r.m ? r.avg.toFixed(2) : '—').padStart(10) +
    (r.m ? Math.abs(r.worstOff).toFixed(1) : '—').padStart(8) + '   ' + w
  )
}
if (!showAll && rows.length > shown.length) {
  console.log(`\n  (${rows.length - shown.length} criteria under 30% not shown — pass --all)`)
  for (const r of rows.filter((x) => x.rate < 0.3))
    console.log(`    ${r.k.slice(0, 31).padEnd(32)} ${`${r.m}/${r.n}`.padStart(8)} ${(100 * r.rate).toFixed(0)}%`)
}
