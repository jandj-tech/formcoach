// COMPARATOR CURVE — how well can the model tell which of two shots is better,
// as a function of how far apart the expert scored them?
//
// WHY THIS EXISTS. pairwise-gate.mjs measured the same thing on 5-15 pairs per
// band and produced 40% / 33% / 60% / 87%. Those were read as "the model is at
// or below chance under a 3-point gap" and that reading drove the whole design
// conversation. It does not survive a confidence interval: 3/9 has a 95% Wilson
// interval of roughly 12-65%, which contains 50%. The bands were never
// distinguishable from chance OR from each other.
//
// 526 pairs exist across the fixtures, so the curve can be measured properly.
// Every downstream idea — anchor ladders, contrastive deltas, coarse bands —
// depends on this curve's shape, so it is worth measuring once and for real.
//
// Both orders are asked and a pair whose answer flips is counted as a FLIP, not
// as a loss (Wang et al., ACL 2024: flip rate rises as the true gap narrows, so
// scoring flips as errors would manufacture the very curve we are testing for).
// Flip rate is reported separately because it is itself a resolution signal.
//
// Usage: ANALYSIS_MODEL=... npx tsx --env-file=.env.local \
//          scripts/eval/comparator-curve.mjs [--per-band 60] [--conc 6]
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'

const arg = (n, d) => Number(process.argv.find((a, i) => process.argv[i - 1] === n) ?? d)
const PER_BAND = arg('--per-band', 60)
const CONC = arg('--conc', 6)
const BANDS = [[0.5, 1.5], [1.6, 2.5], [2.6, 4.0], [4.1, 99]]
const ABST = new Set(['Two Finger Release', 'Shot Arc', 'Ball Rotation'])
const CACHE = process.env.EVAL_FRAME_CACHE ?? '.eval-frame-cache'
const pathFor = (u) => `${CACHE}/${createHash('sha256').update(u).digest('hex')}.b64`

let netFailures = 0
const { db } = await import('../../lib/db.ts')
const { callVisionModel, analysisModel } = await import('../../lib/model-provider.ts')
const fixtures = await db`SELECT slug, frame_urls, expected FROM eval_fixtures WHERE active = true ORDER BY slug`
await db.end()

const mid = (b) => (b[0] + b[1]) / 2
const byCriterion = {}
for (const f of fixtures) {
  const ex = f.expected?.criteria ?? {}
  const src = f.expected?.criteria_source ?? {}
  for (const [name, band] of Object.entries(ex)) {
    if (ABST.has(name) || !Array.isArray(band)) continue
    if ((src[name] ?? 'expert') !== 'expert') continue
    ;(byCriterion[name] ??= []).push({ slug: f.slug, urls: f.frame_urls ?? [], mid: mid(band) })
  }
}
const allPairs = []
for (const [name, list] of Object.entries(byCriterion))
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++)
      allPairs.push({ criterion: name, a: list[i], b: list[j], gap: Math.abs(list[i].mid - list[j].mid) })

// Deterministic shuffle so a band's sample is not biased toward the widest
// pairs inside it (the old script sorted, which is how "gap 1" ended up
// measuring the widest pairs available).
let seed = 12345
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

const framesOf = (fx) =>
  [0, 5, 9, 12, 15, 20]
    .map((i) => fx.urls[i]).filter(Boolean)
    .map((u) => (existsSync(pathFor(u)) ? readFileSync(pathFor(u), 'utf8') : null)).filter(Boolean)

// Every answered comparison is cached to disk the moment it lands. A network
// outage mid-run then costs only the in-flight calls: a resume skips everything
// already answered. This exists because an overnight outage destroyed two whole
// ensemble arms earlier in this project, and because the bare catch below used
// to turn a dropped connection into a silent "unusable" — which does not fail
// the run, it just quietly computes the accuracy off a biased subset.
const CACHE_FILE = '.eval-arms/curve-cache.json'
let cache = {}
try { cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8')) } catch {}
let cacheDirty = 0
function remember(k, v) {
  cache[k] = v
  if (++cacheDirty >= 5) { writeFileSync(CACHE_FILE, JSON.stringify(cache)); cacheDirty = 0 }
}

async function askOnce(p, flip) {
  const key = `${p.criterion}|${p.a.slug}|${p.b.slug}|${flip ? 'BA' : 'AB'}`
  if (key in cache) return cache[key]
  const [first, second] = flip ? [p.b, p.a] : [p.a, p.b]
  const ff = framesOf(first), fs = framesOf(second)
  if (ff.length === 0 || fs.length === 0) return null
  const frames = [...ff, ...fs]
  // Transport failures are retried; a genuine unparseable answer is not.
  for (let attempt = 1; attempt <= 4; attempt++) {
   try {
    const res = await callVisionModel({
      model: analysisModel(),
      framesBase64: frames,
      frameMimeTypes: frames.map(() => 'image/jpeg'),
      userText: `You are shown two basketball shots. The FIRST ${ff.length} images are SHOT 1. The remaining ${fs.length} images are SHOT 2.

Judging ONLY "${p.criterion}", which shot is better on that one criterion?

Answer JSON only: {"better": 1 or 2, "why": "<one short sentence>"}`,
      maxTokens: 3000,
    })
    const m = res.text.match(/\{[\s\S]*\}/)
    const v = m ? JSON.parse(m[0]) : {}
    if (v.better !== 1 && v.better !== 2) { remember(key, null); return null }
    // Normalise to "did it pick shot A?" regardless of presentation order.
    const picked = flip ? v.better === 2 : v.better === 1
    remember(key, picked)
    return picked
   } catch (err) {
    const transient = /fetch|network|ECONN|ETIMEDOUT|socket|EAI_AGAIN|502|503|504|429|terminated/i.test(String(err?.message ?? err))
    if (!transient || attempt === 4) {
      // NOT cached: an unanswered pair must be retried on resume, never frozen
      // into the cache as a failure.
      netFailures++
      return null
    }
    await new Promise((r) => setTimeout(r, 5000 * attempt))
   }
  }
  return null
}

async function runPool(items, fn, conc) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: conc }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  }))
  return out
}

// Wilson score interval — the thing whose absence made 3/9 look like a finding.
function wilson(k, n) {
  if (n === 0) return [0, 0]
  const z = 1.96, p = k / n, d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [(c - m) / d, (c + m) / d]
}

console.log(`model=${analysisModel()}  per-band=${PER_BAND}  concurrency=${CONC}\n`)
const rows = []
for (const [lo, hi] of BANDS) {
  const inBand = allPairs.filter((p) => p.gap >= lo && p.gap <= hi)
  const shuffled = inBand.map((p) => ({ p, k: rnd() })).sort((x, y) => x.k - y.k).map((x) => x.p)
  const sample = shuffled.slice(0, PER_BAND)
  const res = await runPool(sample, async (p) => {
    const [v1, v2] = await Promise.all([askOnce(p, false), askOnce(p, true)])
    if (v1 === null || v2 === null) return 'unusable'
    if (v1 !== v2) return 'flip'
    return v1 === (p.a.mid > p.b.mid) ? 'right' : 'wrong'
  }, CONC)
  const right = res.filter((r) => r === 'right').length
  const wrong = res.filter((r) => r === 'wrong').length
  const flips = res.filter((r) => r === 'flip').length
  const unusable = res.filter((r) => r === 'unusable').length
  const dec = right + wrong
  const [l, u] = wilson(right, dec)
  rows.push({ band: `${lo}-${hi === 99 ? '7' : hi}`, n: sample.length, dec, right, acc: dec ? right / dec : 0, lo: l, hi: u, flips, unusable })
  console.log(
    `gap ${String(`${lo}-${hi === 99 ? '7' : hi}`).padEnd(8)} ` +
    `n=${String(sample.length).padStart(3)}  stable=${String(dec).padStart(3)}  ` +
    `acc=${dec ? ((100 * right) / dec).toFixed(1).padStart(5) : '  n/a'}%  ` +
    `95%CI=[${(100 * l).toFixed(1)}, ${(100 * u).toFixed(1)}]  flips=${flips}  unusable=${unusable}`
  )
}
writeFileSync(CACHE_FILE, JSON.stringify(cache))
const totUnusable = rows.reduce((s, r) => s + r.unusable, 0)
if (netFailures > 0 || totUnusable > 0) {
  console.log(`\n*** INTEGRITY WARNING ***`)
  console.log(`${netFailures} call(s) failed on transport after retries; ${totUnusable} pair(s) unusable.`)
  console.log(`Unusable pairs are DROPPED from the denominator, so a large count means the`)
  console.log(`accuracy above is computed on a biased subset. Re-run to fill them from cache.`)
}
console.log(`\nA band whose CI contains 50 is NOT distinguishable from a coin flip.`)
console.log(`Two bands whose CIs overlap are NOT distinguishable from each other.`)
