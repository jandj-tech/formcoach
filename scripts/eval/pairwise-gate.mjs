// THE PERCEPTION GATE — does the model have ANY discriminative perception?
//
// Every score-based intervention has failed, and a published benchmark on a
// near-identical task (FitAQA) found that injecting ground-truth perception
// takes error-detection F1 from 57.8% to 94.4% — i.e. the models can judge but
// cannot see. If that is true here, no prompt, rubric or aggregation change can
// work, and the only honest paths are to change what the model is shown or to
// stop scoring the criteria it cannot perceive.
//
// This tests it directly and cheaply. Take pairs of shots whose expert scores on
// ONE criterion differ by a wide margin, show both, and ask only "which is
// better?". That is the easiest possible form of the question: no scale, no
// calibration, no severity judgement — just a comparison, on pairs where the
// right answer is not close.
//
// Each pair is asked in BOTH orders, because position bias in LLM judges is
// real and model-dependent (measured 0.002-0.192 across 21 judges).
//
// READING THE RESULT:
//   >= 75% correct and order-stable -> real perception; pairwise scoring is
//                                      worth building (Bradley-Terry).
//   ~50%, or order flips the answer -> the model cannot see the difference even
//                                      when it is large and the question is easy.
//                                      Prompt work is finished; the problem is
//                                      what the model is shown.
//
// Usage: npx tsx --env-file=.env.local scripts/eval/pairwise-gate.mjs [--gap 2] [--max 24]
import { readFileSync, existsSync } from 'fs'
import { createHash } from 'crypto'

const GAP = Number((process.argv.find((a, i) => process.argv[i - 1] === '--gap')) ?? 2)
const MAX = Number((process.argv.find((a, i) => process.argv[i - 1] === '--max')) ?? 24)
// Upper bound too, so a BAND of gap sizes can be tested. Without this the script
// sorts widest-first and "--gap 1" still measures the widest pairs — which is
// the opposite of measuring fine discrimination.
const MAXGAP = Number((process.argv.find((a, i) => process.argv[i - 1] === '--maxgap')) ?? 99)
const ABST = new Set(['Two Finger Release', 'Shot Arc', 'Ball Rotation'])
const CACHE = process.env.EVAL_FRAME_CACHE ?? '.eval-frame-cache'
const pathFor = (u) => `${CACHE}/${createHash('sha256').update(u).digest('hex')}.b64`

const { db } = await import('../../lib/db.ts')
const { callVisionModel, analysisModel } = await import('../../lib/model-provider.ts')

const fixtures = await db`SELECT slug, frame_urls, expected FROM eval_fixtures WHERE active = true ORDER BY slug`
await db.end()

const mid = (b) => (b[0] + b[1]) / 2
// Build wide-gap pairs per criterion.
const pairs = []
const byCriterion = {}
for (const f of fixtures) {
  const ex = f.expected?.criteria ?? {}
  const src = f.expected?.criteria_source ?? {}
  for (const [name, band] of Object.entries(ex)) {
    if (ABST.has(name) || !Array.isArray(band)) continue
    if ((src[name] ?? 'expert') !== 'expert') continue
    ;(byCriterion[name] ??= []).push({ slug: f.slug, urls: f.frame_urls ?? [], mid: mid(band), band })
  }
}
for (const [name, list] of Object.entries(byCriterion)) {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const d = Math.abs(list[i].mid - list[j].mid)
      if (d >= GAP && d <= MAXGAP) pairs.push({ criterion: name, a: list[i], b: list[j], gap: d })
    }
  }
}
pairs.sort((x, y) => (MAXGAP < 99 ? x.gap - y.gap : y.gap - x.gap))
const chosen = pairs.slice(0, MAX)
console.log(`${pairs.length} wide-gap pairs available (gap >= ${GAP}); testing the ${chosen.length} widest\n`)

// Six frames per shot keeps the call affordable and still spans the motion.
const framesOf = (fx) => {
  const idx = [0, 5, 9, 12, 15, 20].map((i) => fx.urls[i]).filter(Boolean)
  return idx.map((u) => (existsSync(pathFor(u)) ? readFileSync(pathFor(u), 'utf8') : null)).filter(Boolean)
}

let correct = 0, wrong = 0, orderFlips = 0, unusable = 0
for (const p of chosen) {
  const fa = framesOf(p.a), fb = framesOf(p.b)
  if (fa.length < 4 || fb.length < 4) { unusable++; continue }
  const verdicts = []
  for (const [first, second, firstIsA] of [[fa, fb, true], [fb, fa, false]]) {
    const frames = [...first, ...second]
    try {
      const res = await callVisionModel({
        model: analysisModel(),
        framesBase64: frames,
        frameMimeTypes: frames.map(() => 'image/jpeg'),
        userText: `You are shown two basketball shots. The FIRST ${first.length} images are SHOT 1. The remaining ${second.length} images are SHOT 2.

Judge ONE thing only: "${p.criterion}".

Which shot is BETTER on that single criterion? Do not score them. Do not comment on anything else.

Answer JSON only: {"better": 1 or 2, "why": "<one sentence naming what you saw>"}`,
        maxTokens: 8000,
      })
      const m = res.text.match(/\{[\s\S]*\}/)
      const v = m ? JSON.parse(m[0]) : {}
      const pickedA = firstIsA ? v.better === 1 : v.better === 2
      verdicts.push({ pickedA, why: v.why })
    } catch (err) {
      verdicts.push(null)
    }
  }
  if (verdicts.some((v) => !v)) { unusable++; continue }
  const [v1, v2] = verdicts
  if (v1.pickedA !== v2.pickedA) {
    orderFlips++
    console.log(`  FLIP  ${p.criterion.slice(0, 26).padEnd(27)} ${p.a.slug} vs ${p.b.slug}  (gap ${p.gap.toFixed(1)}) — order changed the answer`)
    continue
  }
  const truthIsA = p.a.mid > p.b.mid
  const got = v1.pickedA === truthIsA
  if (got) correct++; else wrong++
  console.log(
    `  ${got ? 'RIGHT' : 'WRONG'} ${p.criterion.slice(0, 26).padEnd(27)} ${p.a.slug}(${p.a.mid}) vs ${p.b.slug}(${p.b.mid})  gap ${p.gap.toFixed(1)}` +
      (got ? '' : `\n          said: ${String(v1.why).slice(0, 110)}`)
  )
}
const decided = correct + wrong
console.log(`\nRESULT: ${correct}/${decided} correct = ${decided ? ((100 * correct) / decided).toFixed(1) : '—'}%`)
console.log(`        ${orderFlips} order flips, ${unusable} unusable`)
console.log(`\n>= 75% and few flips -> the model CAN discriminate; pairwise scoring is worth building.`)
console.log(`~50% or many flips   -> it cannot see the difference even on the widest gaps.`)
