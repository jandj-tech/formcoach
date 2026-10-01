// UNCERTAINTY FROM LOGPROBS — the root-cause test.
//
// WHY THIS EXISTS. shot-196 and shot-200 are BYTE-IDENTICAL frame sets (same
// frames_hash) graded at temperature 0, and they score Elbow 6 vs 4, Power 7 vs
// 4, One-Hand 8 vs 4. Identical pixels, deterministic settings, 4-point swings.
// That cannot be perception, rubric or calibration — the input is the same. The
// only mechanism that produces it is the model sitting on a decision boundary:
// when its preference between "4" and "8" is nearly equal, GPU batch
// composition and expert routing decide the token.
//
// If that is right, the probability distribution over the score token is FLAT on
// exactly the cells we get wrong — which is measurable, at grade time, per cell.
// That is the "know when it is off in the moment" the owner asked for, and it is
// a measurement rather than a heuristic.
//
// Two things come out of the same call:
//   EXPECTED VALUE  sum(p_i * score_i) instead of the argmax token. Fixes the
//                   bunching we measured (34% of scores on exactly 9) and gives
//                   sub-integer precision for free.
//   ENTROPY         how spread the distribution is. High entropy = the model has
//                   no real preference = do not show this number as fact.
//
// Usage: npx tsx --env-file=.env.local scripts/eval/logprob-probe.mjs [n_fixtures]
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'

const N = Number(process.argv[2] ?? 8)
const ABST = new Set(['Two Finger Release', 'Shot Arc', 'Ball Rotation'])
const CACHE = process.env.EVAL_FRAME_CACHE ?? '.eval-frame-cache'
const pathFor = (u) => `${CACHE}/${createHash('sha256').update(u).digest('hex')}.b64`
const TOL = 0.3

const { db } = await import('../../lib/db.ts')
const rows = await db`SELECT slug, frame_urls, expected FROM eval_fixtures WHERE active = true ORDER BY slug`
const crit = await db`SELECT id, name, grading_notes, description FROM criteria WHERE active = true ORDER BY id`
await db.end()

const KEY = process.env.OPENROUTER_API_KEY
const MODEL = process.env.ANALYSIS_MODEL ?? 'qwen/qwen3.7-flash'

// One criterion at a time, so the score token is unambiguous in the stream.
const results = []
for (const r of rows) {
  const urls = r.frame_urls ?? []
  const frames = [0, 5, 9, 12, 15, 19, 23].map((i) => urls[i]).filter(Boolean)
    .map((u) => (existsSync(pathFor(u)) ? readFileSync(pathFor(u), 'utf8') : null)).filter(Boolean)
  if (frames.length < 5) continue

  for (const c of crit) {
    const band = r.expected?.criteria?.[c.name]
    if (!Array.isArray(band) || ABST.has(c.name)) continue
    if ((r.expected?.criteria_source?.[c.name] ?? 'expert') !== 'expert') continue

    const content = frames.map((b64) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }))
    content.push({
      type: 'text',
      text: `These frames are one basketball shot, in order.

Criterion: "${c.name}"
${(c.grading_notes || c.description || '').slice(0, 1200)}

Reply with ONLY a single digit from 1 to 9 — the score. No words, no punctuation, no explanation. Just the digit.`,
    })
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL, max_tokens: 3000, temperature: 0,
          logprobs: true, top_logprobs: 5,
          reasoning: { enabled: false },   // reasoning tokens would bury the score token
          messages: [{ role: 'user', content }],
        }),
        signal: AbortSignal.timeout(120_000),
      })
      const j = await res.json()
      const ch = j.choices?.[0]
      const toks = ch?.logprobs?.content ?? []
      const scoreTok = toks.find((t) => /^\s*[1-9]$/.test(t.token))
      if (!scoreTok) continue
      // distribution over digit tokens only, renormalised
      const dist = (scoreTok.top_logprobs ?? [])
        .filter((t) => /^\s*[1-9]$/.test(t.token))
        .map((t) => ({ v: Number(t.token.trim()), p: Math.exp(t.logprob) }))
      const tot = dist.reduce((s, d) => s + d.p, 0)
      if (tot <= 0) continue
      for (const d of dist) d.p /= tot
      const ev = dist.reduce((s, d) => s + d.v * d.p, 0)
      const ent = -dist.reduce((s, d) => s + (d.p > 0 ? d.p * Math.log(d.p) : 0), 0)
      const argmax = dist.reduce((a, b) => (b.p > a.p ? b : a)).v
      const missArg = argmax < band[0] - TOL || argmax > band[1] + TOL
      const missEv = ev < band[0] - TOL || ev > band[1] + TOL
      results.push({ slug: r.slug, criterion: c.name, band, argmax, ev: Math.round(ev * 10) / 10, ent: Math.round(ent * 100) / 100, missArg, missEv })
      console.log(`  ${r.slug.padEnd(10)}${c.name.slice(0, 26).padEnd(27)}[${band[0]},${band[1]}]  argmax ${argmax}${missArg ? '✗' : '✓'}  EV ${ev.toFixed(1)}${missEv ? '✗' : '✓'}  entropy ${ent.toFixed(2)}  ${dist.slice(0, 4).map((d) => d.v + ':' + d.p.toFixed(2)).join(' ')}`)
    } catch (err) { /* skip */ }
  }
}
writeFileSync('/tmp/bias/logprob.json', JSON.stringify(results, null, 1))
const n = results.length
const mA = results.filter((r) => r.missArg).length
const mE = results.filter((r) => r.missEv).length
console.log(`\n${n} cells`)
console.log(`  argmax token miss rate:     ${mA}/${n} = ${((100 * mA) / n).toFixed(1)}%`)
console.log(`  EXPECTED-VALUE miss rate:   ${mE}/${n} = ${((100 * mE) / n).toFixed(1)}%`)
const hi = results.filter((r) => r.ent >= 1.0), lo = results.filter((r) => r.ent < 1.0)
const rate = (a) => (a.length ? ((100 * a.filter((r) => r.missEv).length) / a.length).toFixed(0) + '%' : '—')
console.log(`\nDOES ENTROPY PREDICT A MISS?`)
console.log(`  low entropy  (<1.0): ${lo.length} cells, ${rate(lo)} wrong   <- confident`)
console.log(`  high entropy (>=1.0): ${hi.length} cells, ${rate(hi)} wrong   <- coin flip`)
