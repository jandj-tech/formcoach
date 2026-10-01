// BIG-MISS CATCHER — built only on the one thing that measurably works.
//
// Measured: a pure two-way "is A better than B?" is 87% correct at gaps of 3-7
// points. Everything else tried — absolute scores, three-band verdicts,
// self-reported confidence, deviation-from-normal, claim verification,
// observation categories — is at or near chance.
//
// A BIG MISS is by definition a wide gap: the grader says 8-9, the owner says
// 2-5. So the question "is this shot better than one the owner scored ~3?" is
// exactly the wide-gap comparison the model is good at. If the grader claims 9
// and the model will NOT say the shot beats a known-bad example, the 9 is not
// supported.
//
// Differences from the guard rail that failed (0 caught, 4 broken):
//   - TWO-WAY only. The guard asked "closer to A, B, or between" — a three-way
//     question, which is absolute placement in disguise.
//   - ONE anchor, chosen to be far below the claim, so the gap is wide.
//   - BOTH ORDERS required to agree. Position instability was 25% in the gate,
//     so a single-order answer is not evidence.
//   - It FLAGS rather than rescoring. The measured failure of every corrective
//     intervention is that it damages correct cells; a flag cannot.
//
// Usage: npx tsx --env-file=.env.local scripts/eval/bigmiss-catcher.mjs
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'

const CLAIM_AT = Number(process.env.CATCH_HIGH_AT ?? 7.5)
// The mirror. 5 of the 8 big misses left after the high-side queue are LOW-side:
// a shot the owner scored 8-10 that the grader called 5. The SAME comparison
// against the SAME low anchor tests both, because a low grade claims the shot
// resembles the bad example — if the model says it is clearly BETTER than that
// example, the low grade is contradicted just as a high grade is contradicted by
// the opposite answer. One anchor, one question, two directions of failure.
const CLAIM_LOW_AT = Number(process.env.CATCH_LOW_AT ?? 5.5)
const ABST = new Set(['Two Finger Release', 'Shot Arc', 'Ball Rotation'])
const CACHE = process.env.EVAL_FRAME_CACHE ?? '.eval-frame-cache'
const pathFor = (u) => `${CACHE}/${createHash('sha256').update(u).digest('hex')}.b64`
const TOL = 0.3

const { db } = await import('../../lib/db.ts')
const { callVisionModel, analysisModel } = await import('../../lib/model-provider.ts')
const rows = await db`SELECT slug, frame_urls, expected FROM eval_fixtures WHERE active = true ORDER BY slug`
await db.end()

const mid = (b) => (b[0] + b[1]) / 2
const urlsBySlug = new Map(rows.map((r) => [r.slug, r.frame_urls ?? []]))
const framesOf = (urls) =>
  [0, 6, 10, 13, 17, 22].map((i) => urls[i]).filter(Boolean)
    .map((u) => (existsSync(pathFor(u)) ? readFileSync(pathFor(u), 'utf8') : null)).filter(Boolean)

// low anchors per criterion: expert-scored clearly bad
// A LIST of low anchors per criterion, worst first — not a single one.
// Keeping only the lowest meant that when the cell under test WAS that anchor,
// leave-one-out skipped the cell entirely. That silently dropped 3 of 10 big
// misses, including shot-208 Square graded 9 against [3,5] — the exact case the
// catcher exists for. Fall through to the next-worst anchor instead.
const lowAnchors = {}
for (const r of rows) {
  for (const [name, band] of Object.entries(r.expected?.criteria ?? {})) {
    if (ABST.has(name) || !Array.isArray(band)) continue
    if ((r.expected?.criteria_source?.[name] ?? 'expert') !== 'expert') continue
    const m = mid(band)
    // <= 4 ONLY. Loosening this to 5 to widen the anchor pool cost precision
    // 67% -> 25% and recall 33% -> 11%: a weaker anchor means a narrower gap,
    // and narrow gaps are where the comparison is at chance. The anchor has to
    // be genuinely bad or the question stops being the one the model can answer.
    if (m <= 4) (lowAnchors[name] ??= []).push({ slug: r.slug, m })
  }
}
for (const k of Object.keys(lowAnchors)) lowAnchors[k].sort((a, b) => a.m - b.m)

const base = JSON.parse(readFileSync('/tmp/bias/cur.json', 'utf8')).cells.filter(
  (c) => c.source === 'expert' && !ABST.has(c.criterion) && Array.isArray(c.expected) && c.score != null
)
const isBig = (c) => Math.abs(c.score < c.expected[0] ? c.score - c.expected[0] : c.score > c.expected[1] ? c.score - c.expected[1] : 0) >= 3
const isMiss = (c) => c.score < c.expected[0] - TOL || c.score > c.expected[1] + TOL

let flagged = 0, caughtBig = 0, flaggedCorrect = 0, checked = 0, skipped = 0
const out = []

for (const cell of base) {
  const claimsHigh = cell.score >= CLAIM_AT
  const claimsLow = cell.score <= CLAIM_LOW_AT
  if (!claimsHigh && !claimsLow) continue
  const anc = (lowAnchors[cell.criterion] ?? []).find((a) => a.slug !== cell.fixture)
  if (!anc) { skipped++; continue }
  const tf = framesOf(urlsBySlug.get(cell.fixture) ?? [])
  const af = framesOf(urlsBySlug.get(anc.slug) ?? [])
  if (tf.length < 4 || af.length < 4) { skipped++; continue }
  checked++

  const ask = async (firstIsTarget) => {
    const first = firstIsTarget ? tf : af
    const second = firstIsTarget ? af : tf
    const frames = [...first, ...second]
    const res = await callVisionModel({
      model: analysisModel(),
      framesBase64: frames,
      frameMimeTypes: frames.map(() => 'image/jpeg'),
      userText: `Two basketball shots. The FIRST ${first.length} images are SHOT 1. The remaining ${second.length} are SHOT 2.

One question only, about "${cell.criterion}":

Which shot does this BETTER? Answer 1 or 2. If they are genuinely equal, answer 0.

No scores, no explanation beyond one short sentence.
JSON only: {"better": 0|1|2, "why": "<one sentence>"}`,
      maxTokens: 9000,
    })
    const m = res.text.match(/\{[\s\S]*\}/)
    const v = m ? JSON.parse(m[0]) : {}
    if (v.better === 0) return 'equal'
    const targetWon = firstIsTarget ? v.better === 1 : v.better === 2
    return targetWon ? 'target' : 'anchor'
  }

  try {
    const a = await ask(true)
    const b = await ask(false)
    // Both orders must agree, and what counts as a contradiction flips with the
    // claim: a HIGH grade is unsupported if the shot does not beat the bad
    // example; a LOW grade is unsupported if it clearly does.
    const agree = a === b
    const unsupported = agree && (claimsHigh ? a !== 'target' : a === 'target')
    if (unsupported) {
      flagged++
      if (isBig(cell)) caughtBig++
      else if (!isMiss(cell)) flaggedCorrect++
      console.log(
        `  FLAG ${cell.fixture.padEnd(10)}${cell.criterion.slice(0, 27).padEnd(28)}` +
          `${claimsHigh ? 'HIGH' : 'LOW '} graded ${cell.score}, expert [${cell.expected[0]},${cell.expected[1]}]  ` +
          (isBig(cell) ? 'CAUGHT A BIG MISS' : isMiss(cell) ? 'caught a miss' : 'FALSE ALARM (was correct)')
      )
    }
    out.push({ ...cell, flagged: unsupported })
  } catch { skipped++ }
}

const bigTotal = base.filter(isBig).length
const bigHigh = base.filter((c) => isBig(c) && (c.score >= CLAIM_AT || c.score <= CLAIM_LOW_AT)).length
console.log(`\nBIG-MISS CATCHER (claims >= ${CLAIM_AT} or <= ${CLAIM_LOW_AT}, both orders must agree)`)
console.log(`  checked ${checked} high-scored cells, skipped ${skipped}`)
console.log(`  flagged ${flagged}`)
console.log(`  of those: ${caughtBig} were BIG misses, ${flaggedCorrect} were correct scores (false alarms)`)
console.log(`  big misses among high claims: ${bigHigh} of ${bigTotal} total`)
console.log(`  RECALL on catchable big misses: ${bigHigh ? ((100 * caughtBig) / bigHigh).toFixed(0) : '—'}%`)
writeFileSync('/tmp/bias/catcher.json', JSON.stringify(out, null, 1))
