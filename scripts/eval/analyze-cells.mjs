// Reports what a --dump file actually supports, with CORRELATION as the primary
// number.
//
// WHY THIS EXISTS ALONGSIDE analyze-runs.mjs: that script parses the printed
// FAILURES out of a run log, which is enough for a miss rate and nothing else.
// A miss rate cannot distinguish the two failure modes that matter here, and
// conflating them cost most of a week:
//
//   BIAS   — the grader tracks the expert but sits off to one side. Shows up as
//            misses running one direction. Fixable by rubric content.
//   NO
//   SIGNAL — the grader's score is barely related to the expert's at all. Shows
//            up as a low r while the miss rate looks unremarkable. NOT fixable
//            by recentring; the rubric has to change what the model looks at.
//
// Two criteria in this suite sit at r = 0.01 and r = 0.07 — they emit plausible
// numbers unrelated to the expert while varying MORE than the expert does — and
// their miss rates looked ordinary. One criterion scores 0 misses purely
// because expert and grader both always say ~7.7 (sd 0.38 vs 0.37); it passes
// by not discriminating. None of that is visible in a miss rate.
//
// Usage:
//   npx tsx scripts/eval/analyze-cells.mjs <dump.json>            one arm
//   npx tsx scripts/eval/analyze-cells.mjs <before.json> <after.json>
//                                                                 paired diff
import { readFileSync } from 'fs'
import { basename } from 'path'

/** Owner-set grace band: within this much of the expected range counts as correct. */
const TOLERANCE = Number(process.env.EVAL_TOLERANCE ?? '0.3') || 0

/** The only criteria allowed to abstain. Everything else is always shown to the
 *  player, so a null there is a failure to grade, not a safe hedge. */
const ABSTAIN_OK = new Set(['Two Finger Release', 'Shot Arc', 'Ball Rotation'])

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (files.length === 0 || files.length > 2) {
  console.error('usage: analyze-cells.mjs <dump.json> [<after-dump.json>]')
  process.exit(1)
}

const mid = (c) => (c.expected[0] + c.expected[1]) / 2
/** Signed distance outside the band: negative = too low, positive = too high. */
const signedErr = (c) =>
  c.score < c.expected[0] ? c.score - c.expected[0] : c.score > c.expected[1] ? c.score - c.expected[1] : 0
const isMiss = (c) => c.score === null || Math.abs(signedErr(c)) > TOLERANCE

const sd = (a) => {
  if (a.length < 2) return NaN
  const m = a.reduce((x, y) => x + y, 0) / a.length
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length)
}
const pearson = (xs, ys) => {
  const n = xs.length
  if (n < 3) return NaN
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my
    sxy += a * b; sxx += a * a; syy += b * b
  }
  return sxx === 0 || syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy)
}
/** Wilson score interval — the right interval for a proportion at this n. */
const wilson = (k, n) => {
  if (n === 0) return [0, 0]
  const z = 1.96, p = k / n, d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const e = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [(100 * (c - e)) / d, (100 * (c + e)) / d]
}
/** Two-sided exact binomial against p=0.5, for "do misses run one direction". */
const signTest = (k, n) => {
  if (n === 0) return 1
  const lg = (x) => { let s = 0; for (let i = 2; i <= x; i++) s += Math.log(i); return s }
  let p = 0
  for (let i = 0; i <= k; i++) p += Math.exp(lg(n) - lg(i) - lg(n - i) + n * Math.log(0.5))
  return Math.min(1, 2 * p)
}

function load(path) {
  const d = JSON.parse(readFileSync(path, 'utf8'))
  const cells = d.cells.filter(
    (c) => c.source === 'expert' && !ABSTAIN_OK.has(c.criterion) && Array.isArray(c.expected)
  )
  return { path, meta: d, cells, scored: cells.filter((c) => c.score !== null) }
}

function report(arm) {
  const { meta, cells, scored } = arm
  console.log(`\n${'='.repeat(78)}`)
  console.log(`${basename(arm.path)}   model=${meta.model}  passes=${meta.passes}`)
  console.log(`RUBRIC_OVERRIDE=${meta.env?.RUBRIC_OVERRIDE ?? '(none)'}`)

  // Lost fixtures first, always. An arm measured on a smaller suite is not a
  // weaker measurement, it is a different one — "0 failures out of 0 fixtures"
  // has read as a clean sweep in this project more than once.
  const lost = meta.lostFixtures ?? 0
  if (lost > 0) {
    console.log(`\n*** ${lost} FIXTURE(S) LOST — ${meta.ranFixtures} ran. NOT comparable to a full arm. ***`)
  } else {
    console.log(`${meta.ranFixtures} fixtures ran, 0 lost.`)
  }

  const misses = cells.filter(isMiss)
  const [lo, hi] = wilson(misses.length, cells.length)
  console.log(
    `\nMUST-SCORE MISS RATE: ${misses.length}/${cells.length} = ` +
      `${((100 * misses.length) / cells.length).toFixed(1)}%  CI95 [${lo.toFixed(1)}, ${hi.toFixed(1)}]` +
      `   (tolerance ${TOLERANCE})`
  )
  const nulls = cells.length - scored.length
  if (nulls > 0) console.log(`${nulls} cell(s) returned null on a criterion that must always be scored.`)

  const r = pearson(scored.map(mid), scored.map((c) => c.score))
  console.log(
    `POOLED r vs expert: ${r.toFixed(3)}   ` +
      `(expert sd ${sd(scored.map(mid)).toFixed(2)}, grader sd ${sd(scored.map((c) => c.score)).toFixed(2)})`
  )
  console.log('r is the primary number: a centred non-measurement is still a non-measurement.')

  const by = new Map()
  for (const c of cells) {
    if (!by.has(c.criterion)) by.set(c.criterion, [])
    by.get(c.criterion).push(c)
  }
  const rows = [...by.entries()].map(([k, cs]) => {
    const s = cs.filter((c) => c.score !== null)
    const low = cs.filter((c) => signedErr(c) < -TOLERANCE).length
    const high = cs.filter((c) => signedErr(c) > TOLERANCE).length
    return {
      k, n: cs.length, miss: low + high, low, high,
      r: pearson(s.map(mid), s.map((c) => c.score)),
      esd: sd(s.map(mid)), gsd: sd(s.map((c) => c.score)),
    }
  })
  // Worst signal first — that is the work queue.
  rows.sort((a, b) => (isNaN(a.r) ? -1 : a.r) - (isNaN(b.r) ? -1 : b.r))

  console.log(`\n${'criterion'.padEnd(34)} n  miss  low high      r   e.sd  g.sd  verdict`)
  for (const x of rows) {
    const rTxt = isNaN(x.r) ? '  n/a' : (x.r >= 0 ? '+' : '') + x.r.toFixed(2)
    // A criterion the grader cannot rank is a different problem from one it
    // ranks but mis-centres, and they need different fixes.
    const verdict =
      x.n < 3 ? 'n too small'
        : isNaN(x.r) ? 'no variance'
        : x.r < 0.3 ? 'NO SIGNAL — rebuild'
        : x.esd < 0.5 && x.gsd < 0.5 ? 'undiscriminating'
        : x.low >= 3 && x.high === 0 ? 'BIAS low'
        : x.high >= 3 && x.low === 0 ? 'BIAS high'
        : x.gsd > x.esd * 1.5 ? 'over-spread'
        : 'ok'
    console.log(
      `  ${x.k.slice(0, 31).padEnd(32)}${String(x.n).padStart(2)}  ${String(x.miss).padStart(4)}  ` +
        `${String(x.low).padStart(3)} ${String(x.high).padStart(4)}  ${rTxt.padStart(6)}  ` +
        `${x.esd.toFixed(2)}  ${x.gsd.toFixed(2)}  ${verdict}`
    )
  }

  const L = rows.reduce((a, b) => a + b.low, 0)
  const H = rows.reduce((a, b) => a + b.high, 0)
  console.log(
    `\nDIRECTION: ${L} low vs ${H} high — sign test p = ${signTest(Math.min(L, H), L + H).toFixed(4)}` +
      `  (p < 0.05 means a systematic bias to fix in rubric content)`
  )
  return arm
}

const arms = files.map(load).map(report)

if (arms.length === 2) {
  // Paired on shared cells only. Comparing arm totals has produced two false
  // results in this project; McNemar on the cells that both arms measured is
  // the comparison that survives a differing fixture count.
  const [a, b] = arms
  const key = (c) => `${c.fixture}|${c.criterion}`
  const A = new Map(a.cells.map((c) => [key(c), c]))
  const B = new Map(b.cells.map((c) => [key(c), c]))
  const shared = [...A.keys()].filter((k) => B.has(k))
  let fixed = 0, broke = 0, bothBad = 0
  for (const k of shared) {
    const am = isMiss(A.get(k)), bm = isMiss(B.get(k))
    if (am && !bm) fixed++
    else if (!am && bm) broke++
    else if (am && bm) bothBad++
  }
  console.log(`\n${'='.repeat(78)}\nPAIRED COMPARISON on ${shared.length} shared cells`)
  console.log(`  fixed: ${fixed}   broke: ${broke}   still missing in both: ${bothBad}`)
  console.log(`  net: ${fixed - broke > 0 ? '+' : ''}${fixed - broke} cells`)
  // McNemar exact: only the discordant pairs carry information.
  console.log(`  McNemar exact p = ${signTest(Math.min(fixed, broke), fixed + broke).toFixed(4)}`)
  if (fixed + broke < 10) {
    console.log('  NOTE: fewer than 10 discordant cells — this cannot resolve a small effect.')
  }
  const rA = pearson(a.scored.map(mid), a.scored.map((c) => c.score))
  const rB = pearson(b.scored.map(mid), b.scored.map((c) => c.score))
  console.log(`  pooled r: ${rA.toFixed(3)} -> ${rB.toFixed(3)}  (${rB > rA ? 'better' : 'worse'} signal)`)
}
