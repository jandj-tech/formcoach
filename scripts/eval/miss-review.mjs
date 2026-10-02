// Miss review for one arm dump: per-criterion miss table, then every miss over
// a threshold with the run scores and the frame-check cue record that was
// available for that run - so the answer to "why did the check not catch
// this" is read off the dump, not guessed from the log.
//
// Usage: node scripts/eval/miss-review.mjs .eval-arms/e58.json [--over 1.5] [--criterion Elbow]
import { readFileSync } from 'fs'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
if (!file) { console.error('usage: node scripts/eval/miss-review.mjs <dump.json> [--over 1.5] [--criterion name]'); process.exit(2) }
const over = Number(args[args.indexOf('--over') + 1] || 1.5) || 1.5
const critArg = args.includes('--criterion') ? args[args.indexOf('--criterion') + 1] : null
const d = JSON.parse(readFileSync(file, 'utf8'))

const cells = d.cells.filter((c) => c.source === 'expert' && Array.isArray(c.expected) && c.score !== null)
const delta = (s, [lo, hi]) => (s < lo ? s - lo : s > hi ? s - hi : 0)

// Per-criterion table
const byCrit = new Map()
for (const c of cells) {
  const k = c.criterion
  const row = byCrit.get(k) || { n: 0, miss: 0, over15: 0, over2: 0, low: 0, high: 0 }
  const dl = delta(c.score, c.expected)
  row.n++
  if (Math.abs(dl) > 0.3) { row.miss++; if (dl < 0) row.low++; else row.high++ }
  if (Math.abs(dl) > 1.5) row.over15++
  if (Math.abs(dl) > 2) row.over2++
  byCrit.set(k, row)
}
console.log(`${file}: ${cells.length} expert cells, ${d.ranFixtures ?? '?'} fixtures ran, ${d.lostFixtures ?? 0} lost`)
console.log('env:', JSON.stringify(d.env))
console.log('\ncriterion                                   n   miss    >1.5   >2   low/high')
for (const [k, r] of [...byCrit.entries()].sort((a, b) => b[1].over15 - a[1].over15 || b[1].miss - a[1].miss)) {
  console.log(`${k.padEnd(42)} ${String(r.n).padStart(3)}  ${String(r.miss).padStart(3)} (${(100 * r.miss / r.n).toFixed(0).padStart(3)}%)  ${String(r.over15).padStart(3)}  ${String(r.over2).padStart(3)}   ${r.low}/${r.high}`)
}
const tot = [...byCrit.values()].reduce((a, r) => ({ n: a.n + r.n, miss: a.miss + r.miss, over15: a.over15 + r.over15, over2: a.over2 + r.over2 }), { n: 0, miss: 0, over15: 0, over2: 0 })
console.log(`TOTAL  any ${tot.miss}/${tot.n} = ${(100 * tot.miss / tot.n).toFixed(1)}%   >1.5: ${tot.over15}/${tot.n} = ${(100 * tot.over15 / tot.n).toFixed(1)}%   >2: ${tot.over2}/${tot.n} = ${(100 * tot.over2 / tot.n).toFixed(1)}%`)

// Every miss over the threshold, with what the checks saw
const short = (crit) => crit.split(' — ')[0].split(' / ')[0]
console.log(`\n=== misses over ${over} (${critArg ? 'criterion ~ ' + critArg : 'all criteria'}) ===`)
for (const c of cells) {
  const dl = delta(c.score, c.expected)
  if (Math.abs(dl) <= over) continue
  if (critArg && !c.criterion.toLowerCase().includes(critArg.toLowerCase())) continue
  console.log(`\n${c.fixture}  ${c.criterion}  got ${c.score} exp [${c.expected}]  ${dl > 0 ? '+' : ''}${dl}`)
  if (Array.isArray(c.run_scores)) console.log(`  run scores: ${JSON.stringify(c.run_scores)}`)
  const runs = c.frame_checks ?? []
  runs.forEach((fc, i) => {
    const ap = c.frame_checks_applied?.[i]
    if (!fc) { console.log(`  run ${i + 1}: checks did not run${ap === null ? ' (gate error or not checkable)' : ''}`); return }
    const e = fc.elbow, sq = fc.square, pw = fc.power
    const parts = [`R=${fc.release}`, `crop=${fc.crop ? 'yes' : 'NO'}`]
    if (/Elbow|Pocket|Power|Guide|One Hand/.test(c.criterion) && e) parts.push(`elbow: catapult=${e.catapult} v_top=${e.v_top} v_throw=${e.v_throw} flared=${e.flared} elbow_out=${e.elbow_out} clean=${e.clean} n=${e.answers} counts=${JSON.stringify(e.counts)}`)
    if (/Power/.test(c.criterion) && pw) parts.push(`power: ${JSON.stringify(pw)}`)
    if (/Square/.test(c.criterion) && sq) parts.push(`square: ${JSON.stringify(sq)}`)
    if (/Feet/.test(c.criterion) && fc.feet) parts.push(`feet: ${JSON.stringify(fc.feet)}`)
    if (/Hand|Release/.test(c.criterion) && fc.hands) parts.push(`hands: ${JSON.stringify(fc.hands)}`)
    parts.push(`applied: ${JSON.stringify((ap || []).filter((x) => x.startsWith(short(c.criterion))))}`)
    console.log(`  run ${i + 1}: ${parts.join(' | ')}`)
  })
}
