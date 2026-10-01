// BIG-MISS GUARD RAIL — stop the grader telling a bad shot it is fine.
//
// The product goal is not +-1 precision, which E39 shows this model cannot do
// (it resolves ~6 points; the bands demand ~1). It is to eliminate the errors
// that destroy trust: 10 of 116 cells are off by 3+ points, and 5 of those told
// a shot the owner scored 1-5 that it was an 8 or 9.
//
// WHY A COMPARISON AND NOT A CHECK. The claim-verification pass (E-verify) asked
// "is this stated reason true?" and made things worse — 6 fixed against 17
// broken — because asked to scrutinise, the model manufactures doubt about
// everything, including shots the owner scored [8,10]. But asked "which of these
// two is better", on a wide gap, it is right 87% of the time. So the guard is
// built from the thing it is good at.
//
// For each criterion the grader scored HIGH, show it a known-BAD example and a
// known-GOOD example of that same criterion and ask which the test shot
// resembles. Only if it says "closer to the bad one" is the score clamped.
// Anchors are leave-one-out, and a clamp only ever LOWERS a high score, so the
// guard cannot damage a correct low score.
//
// Usage: npx tsx --env-file=.env.local scripts/eval/guard-rail.mjs
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'

const HIGH_AT = Number(process.env.GUARD_HIGH_AT ?? 8)
const CLAMP_TO = Number(process.env.GUARD_CLAMP_TO ?? 5)
const ABST = new Set(['Two Finger Release', 'Shot Arc', 'Ball Rotation'])
const CACHE = process.env.EVAL_FRAME_CACHE ?? '.eval-frame-cache'
const pathFor = (u) => `${CACHE}/${createHash('sha256').update(u).digest('hex')}.b64`
const TOL = 0.3

const { db } = await import('../../lib/db.ts')
const { callVisionModel, analysisModel } = await import('../../lib/model-provider.ts')
const rows = await db`SELECT slug, frame_urls, expected FROM eval_fixtures WHERE active = true ORDER BY slug`
await db.end()

const mid = (b) => (b[0] + b[1]) / 2
const framesOf = (urls) =>
  [0, 6, 10, 13, 17, 22]
    .map((i) => urls[i])
    .filter(Boolean)
    .map((u) => (existsSync(pathFor(u)) ? readFileSync(pathFor(u), 'utf8') : null))
    .filter(Boolean)

// Per criterion: the worst and best expert-labelled fixtures serve as anchors.
const pools = {}
for (const r of rows) {
  for (const [name, band] of Object.entries(r.expected?.criteria ?? {})) {
    if (ABST.has(name) || !Array.isArray(band)) continue
    if ((r.expected?.criteria_source?.[name] ?? 'expert') !== 'expert') continue
    ;(pools[name] ??= []).push({ slug: r.slug, urls: r.frame_urls ?? [], band, mid: mid(band) })
  }
}

// Replay the baseline arm's scores and apply the guard to the high ones.
const base = JSON.parse(readFileSync('/tmp/bias/cur.json', 'utf8')).cells.filter(
  (c) => c.source === 'expert' && !ABST.has(c.criterion) && Array.isArray(c.expected) && c.score != null
)
const isMiss = (s, c) => s < c.expected[0] - TOL || s > c.expected[1] + TOL
const isBig = (s, c) => Math.abs(s < c.expected[0] ? s - c.expected[0] : s > c.expected[1] ? s - c.expected[1] : 0) >= 3

let fired = 0, rightlyFired = 0, wronglyFired = 0, checked = 0
const after = []

for (const cell of base) {
  let score = cell.score
  if (score >= HIGH_AT) {
    const pool = (pools[cell.criterion] ?? []).filter((p) => p.slug !== cell.fixture)
    const bad = pool.filter((p) => p.mid <= 4.5).sort((a, b) => a.mid - b.mid)[0]
    const good = pool.filter((p) => p.mid >= 8).sort((a, b) => b.mid - a.mid)[0]
    const target = rows.find((r) => r.slug === cell.fixture)
    if (bad && good && target) {
      checked++
      const tf = framesOf(target.frame_urls ?? []), bf = framesOf(bad.urls), gf = framesOf(good.urls)
      if (tf.length >= 4 && bf.length >= 4 && gf.length >= 4) {
        const frames = [...tf, ...bf, ...gf]
        try {
          const res = await callVisionModel({
            model: analysisModel(),
            framesBase64: frames,
            frameMimeTypes: frames.map(() => 'image/jpeg'),
            userText: `Three basketball shots, as groups of images in order:
  SHOT X   — images 1-${tf.length}
  EXAMPLE A — images ${tf.length + 1}-${tf.length + bf.length}   (a shot with a REAL FAULT on the criterion below)
  EXAMPLE B — images ${tf.length + bf.length + 1}-${frames.length}   (a shot that does this WELL)

Criterion: "${cell.criterion}"

On that one criterion only, is SHOT X more like EXAMPLE A or more like EXAMPLE B?
Do not score anything. If SHOT X is clearly between them, say "between".

Answer JSON only: {"closer": "A"|"B"|"between", "why": "<one sentence>"}`,
            maxTokens: 10000,
          })
          const m = res.text.match(/\{[\s\S]*\}/)
          const v = m ? JSON.parse(m[0]) : {}
          if (v.closer === 'A') {
            const before = score
            score = Math.min(score, CLAMP_TO)
            fired++
            const wasBigMiss = isBig(before, cell)
            const nowMiss = isMiss(score, cell)
            if (wasBigMiss && !isBig(score, cell)) rightlyFired++
            else if (!isMiss(before, cell) && nowMiss) wronglyFired++
            console.log(
              `  CLAMP ${cell.fixture.padEnd(10)}${cell.criterion.slice(0, 28).padEnd(29)}expert [${cell.expected[0]},${cell.expected[1]}]  ${before} -> ${score}   ${wasBigMiss ? 'CAUGHT A BIG MISS' : isMiss(before, cell) ? 'was already wrong' : 'BROKE a correct score'}`
            )
          }
        } catch { /* leave the score alone on failure */ }
      }
    }
  }
  after.push({ ...cell, score })
}

const bigBefore = base.filter((c) => isBig(c.score, c)).length
const bigAfter = after.filter((c) => isBig(c.score, c)).length
const missBefore = base.filter((c) => isMiss(c.score, c)).length
const missAfter = after.filter((c) => isMiss(c.score, c)).length
console.log(`\nGUARD RAIL: checked ${checked} high-scored cells, clamped ${fired}`)
console.log(`  BIG misses (3+ points):  ${bigBefore} -> ${bigAfter}`)
console.log(`  all misses:              ${missBefore} -> ${missAfter}   (${(100 * missBefore / base.length).toFixed(1)}% -> ${(100 * missAfter / base.length).toFixed(1)}%)`)
console.log(`  caught a big miss: ${rightlyFired}   broke a correct score: ${wronglyFired}`)
writeFileSync('/tmp/bias/guard.json', JSON.stringify({ cells: after }, null, 1))
