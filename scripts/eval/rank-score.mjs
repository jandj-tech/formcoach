// RANKING-BASED SCORING — score a shot by where it RANKS against anchors of
// known expert score, instead of asking the model for a number.
//
// Justified by E36: asked "which of these two is better on this criterion", the
// model got 11 of 11 right on Feet Shoulder Width across gaps up to 7 points,
// while its ABSOLUTE miss rate on that same criterion is 41%. The perception is
// there; the number-picking loses it. Every previous intervention operated on
// the number and every one failed.
//
// METHOD. For one criterion, pick anchors spanning the expert's range. Show the
// test shot alongside the anchors and ask only for a RANKING. The score is then
// interpolated from the expert scores of the anchors it beat and lost to — the
// model never names a number.
//
// LEAVE-ONE-OUT: a shot is never scored against itself, and anchors are drawn
// only from OTHER fixtures, so this is not scoring against its own answer.
//
// Usage: npx tsx --env-file=.env.local scripts/eval/rank-score.mjs "Feet Shoulder Width Apart"
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'

const CRITERION = process.argv[2] ?? 'Feet Shoulder Width Apart'
const N_ANCHORS = Number(process.env.RANK_ANCHORS ?? 3)
const CACHE = process.env.EVAL_FRAME_CACHE ?? '.eval-frame-cache'
const pathFor = (u) => `${CACHE}/${createHash('sha256').update(u).digest('hex')}.b64`
const TOL = 0.3

const { db } = await import('../../lib/db.ts')
const { callVisionModel, analysisModel } = await import('../../lib/model-provider.ts')
const rows = await db`SELECT slug, frame_urls, expected FROM eval_fixtures WHERE active = true ORDER BY slug`
await db.end()

const mid = (b) => (b[0] + b[1]) / 2
const pool = rows
  .map((r) => {
    const band = r.expected?.criteria?.[CRITERION]
    const src = r.expected?.criteria_source?.[CRITERION] ?? 'expert'
    return Array.isArray(band) && src === 'expert'
      ? { slug: r.slug, urls: r.frame_urls ?? [], band, mid: mid(band) }
      : null
  })
  .filter(Boolean)

console.log(`"${CRITERION}": ${pool.length} expert-labelled fixtures\n`)
if (pool.length < N_ANCHORS + 2) { console.error('not enough labelled fixtures'); process.exit(1) }

const framesOf = (fx) =>
  [0, 6, 10, 13, 17, 22]
    .map((i) => fx.urls[i])
    .filter(Boolean)
    .map((u) => (existsSync(pathFor(u)) ? readFileSync(pathFor(u), 'utf8') : null))
    .filter(Boolean)

const sorted = [...pool].sort((a, b) => a.mid - b.mid)
let hit = 0, miss = 0, failed = 0
const out = []

for (const target of pool) {
  // Anchors: evenly spaced through the sorted pool, excluding the target.
  const others = sorted.filter((p) => p.slug !== target.slug)
  const anchors = Array.from({ length: N_ANCHORS }, (_, k) =>
    others[Math.round((k * (others.length - 1)) / (N_ANCHORS - 1))]
  ).filter((a, i, arr) => arr.findIndex((x) => x.slug === a.slug) === i)

  const tf = framesOf(target)
  const af = anchors.map(framesOf)
  if (tf.length < 4 || af.some((f) => f.length < 4)) { failed++; continue }

  const frames = [...tf, ...af.flat()]
  const labels = [`SHOT X (the one to place): images 1-${tf.length}`]
  let cursor = tf.length
  anchors.forEach((a, i) => {
    labels.push(`ANCHOR ${i + 1}: images ${cursor + 1}-${cursor + af[i].length}`)
    cursor += af[i].length
  })

  try {
    const res = await callVisionModel({
      model: analysisModel(),
      framesBase64: frames,
      frameMimeTypes: frames.map(() => 'image/jpeg'),
      userText: `You are shown ${anchors.length + 1} basketball shots, as groups of images in this order:

${labels.join('\n')}

Judge ONE thing only: "${CRITERION}".

Do NOT give any shot a score. Instead, for EACH anchor say whether SHOT X is better than it, worse than it, or the same, on that single criterion.

Answer JSON only:
{"comparisons": [{"anchor": 1, "shotX": "better"|"worse"|"same"}, ...], "why": "<one sentence on what you saw in SHOT X>"}`,
      maxTokens: 12000,
    })
    const m = res.text.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('no JSON')
    const parsed = JSON.parse(m[0])
    // Interpolate: the score sits between the best anchor it beat and the worst
    // it lost to. "same" pins it to that anchor.
    let lo = 0, hi = 10
    for (const c of parsed.comparisons ?? []) {
      const a = anchors[Number(c.anchor) - 1]
      if (!a) continue
      if (c.shotX === 'better') lo = Math.max(lo, a.mid)
      else if (c.shotX === 'worse') hi = Math.min(hi, a.mid)
      else if (c.shotX === 'same') { lo = a.mid; hi = a.mid }
    }
    if (lo > hi) { const t = lo; lo = hi; hi = t } // contradictory answers
    const score = Math.round(((lo + hi) / 2) * 2) / 2
    const ok = score >= target.band[0] - TOL && score <= target.band[1] + TOL
    if (ok) hit++; else miss++
    out.push({ slug: target.slug, band: target.band, score, ok })
    console.log(
      `  ${ok ? 'HIT ' : 'MISS'} ${target.slug.padEnd(10)} expert [${target.band[0]}, ${target.band[1]}]  ranked -> ${score}` +
        (ok ? '' : `   (bracket ${lo}-${hi})`)
    )
  } catch (err) {
    failed++
    console.log(`  FAIL ${target.slug}: ${String(err.message).slice(0, 80)}`)
  }
}
const n = hit + miss
console.log(`\nRANKED SCORING: ${miss}/${n} missed = ${n ? ((100 * miss) / n).toFixed(1) : '—'}%   (${failed} failed)`)
writeFileSync('/tmp/bias/rank-' + CRITERION.replace(/[^a-z]/gi, '') + '.json', JSON.stringify(out, null, 1))
