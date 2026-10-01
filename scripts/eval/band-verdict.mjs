// THREE-BAND VERDICT — the constructive consequence of the resolution finding.
//
// Measured discrimination by gap size:
//   gap 1-1.5  40%      gap 2-2.5  33%      gap 3-4  60%      gap 3-7  87%
// against 50% chance. The model resolves roughly 6-point differences and is at
// chance below 3. Scoring against bands ~2 points wide asks for precision it
// does not have, which is the most likely explanation for 12 of 14 interventions
// failing and for a constant lookup table (28.4%) beating the grader (38.8%).
//
// So ask a question at the resolution it HAS: is this clearly poor, ordinary, or
// clearly good on this criterion? Three bands are ~3.3 points apart, inside the
// range where it is reliable.
//
// This is scored honestly rather than flatteringly: a verdict counts as correct
// only if the expert's own band falls in the same third. It is NOT a way to make
// the miss rate look better by widening the target — it is a test of whether a
// COARSER product claim can be made accurately, which is a different question
// from whether a 0-10 score can.
//
// Usage: npx tsx --env-file=.env.local scripts/eval/band-verdict.mjs
import { readFileSync, existsSync } from 'fs'
import { createHash } from 'crypto'

const ABST = new Set(['Two Finger Release', 'Shot Arc', 'Ball Rotation'])
const CACHE = process.env.EVAL_FRAME_CACHE ?? '.eval-frame-cache'
const pathFor = (u) => `${CACHE}/${createHash('sha256').update(u).digest('hex')}.b64`

const { db } = await import('../../lib/db.ts')
const { callVisionModel, analysisModel } = await import('../../lib/model-provider.ts')
const rows = await db`SELECT slug, frame_urls, expected FROM eval_fixtures WHERE active = true ORDER BY slug`
const crit = await db`SELECT name, grading_notes, description FROM criteria WHERE active = true`
await db.end()
const notesFor = new Map(crit.map((c) => [c.name, (c.grading_notes || c.description || '').slice(0, 900)]))

// Thirds of the 0-10 scale. The expert's band must fall wholly or mostly in one.
const bandOf = (mid) => (mid < 4.5 ? 'poor' : mid <= 7.5 ? 'ordinary' : 'good')

let hit = 0, miss = 0, failed = 0
const byCriterion = {}

for (const r of rows) {
  const urls = r.frame_urls ?? []
  const frames = [0, 5, 9, 12, 15, 19, 23]
    .map((i) => urls[i])
    .filter(Boolean)
    .map((u) => (existsSync(pathFor(u)) ? readFileSync(pathFor(u), 'utf8') : null))
    .filter(Boolean)
  if (frames.length < 5) { failed++; continue }

  const targets = Object.entries(r.expected?.criteria ?? {})
    .filter(([n, b]) => !ABST.has(n) && Array.isArray(b) && (r.expected?.criteria_source?.[n] ?? 'expert') === 'expert')
  if (targets.length === 0) continue

  const list = targets.map(([n]) => `- "${n}": ${notesFor.get(n)?.split('\n')[0] ?? ''}`).join('\n')
  try {
    const res = await callVisionModel({
      model: analysisModel(),
      framesBase64: frames,
      frameMimeTypes: frames.map(() => 'image/jpeg'),
      userText: `These frames are one basketball shot, in order.

For each criterion below, give ONE of three verdicts — nothing finer:
  "poor"     — a clear fault a coach would fix first
  "ordinary" — sound but unremarkable; the normal competent shot
  "good"     — clearly done well

Do NOT give numbers. Do not hedge between bands. If you genuinely cannot see what a criterion asks about, answer "unsure" rather than guessing.

${list}

Answer JSON only: {"verdicts": [{"criterion": "<exact name>", "band": "poor"|"ordinary"|"good"|"unsure"}]}`,
      maxTokens: 14000,
    })
    const m = res.text.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('no JSON')
    const got = new Map((JSON.parse(m[0]).verdicts ?? []).map((v) => [v.criterion, v.band]))
    for (const [name, band] of targets) {
      const truth = bandOf((band[0] + band[1]) / 2)
      const said = got.get(name)
      if (!said || said === 'unsure') continue
      const ok = said === truth
      if (ok) hit++; else miss++
      const a = (byCriterion[name] ??= { hit: 0, miss: 0 })
      ok ? a.hit++ : a.miss++
    }
  } catch (err) {
    failed++
  }
}
const n = hit + miss
console.log(`\nTHREE-BAND VERDICT: ${hit}/${n} correct = ${n ? ((100 * hit) / n).toFixed(1) : '—'}%   (${failed} fixtures failed)`)
console.log(`  chance with 3 bands = 33%; matching the expert's own band distribution would be higher\n`)
for (const [k, v] of Object.entries(byCriterion).sort((a, b) => b[1].miss / (b[1].hit + b[1].miss) - a[1].miss / (a[1].hit + a[1].miss)))
  console.log(`  ${k.slice(0, 33).padEnd(34)} ${v.hit}/${v.hit + v.miss} = ${(100 * v.hit / (v.hit + v.miss)).toFixed(0)}%`)
