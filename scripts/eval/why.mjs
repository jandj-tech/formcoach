// Prints the model's OWN REASONING for the cells that miss worst, next to the
// expert's band. This is the "why" step, and it had been skipped: every arm so
// far reported scores and never read the justification attached to them.
//
// Usage: npx tsx --env-file=.env.local scripts/eval/why.mjs shot-125 shot-208 ...
//        WHY_CRITERIA="Square to the Basket,Source of Shot Power" to filter
import { writeFileSync } from 'fs'
const { db } = await import('../../lib/db.ts')
const { runFixtureOnceVerbose } = await import('../../lib/eval.ts')

const slugs = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const only = (process.env.WHY_CRITERIA ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const TOL = 0.3

const fixtures = await db`
  SELECT slug, frames_hash, frame_urls, expected FROM eval_fixtures
  WHERE slug = ANY(${slugs}) AND active = true ORDER BY slug`

const out = []
for (const f of fixtures) {
  let res
  try {
    res = await runFixtureOnceVerbose(f, { passes: 1 })
  } catch (err) {
    console.log(`\n### ${f.slug}: FAILED ${err.message.slice(0, 160)}`)
    continue
  }
  console.log(`\n${'='.repeat(78)}\n### ${f.slug}`)
  const exp = f.expected?.criteria ?? {}
  const src = f.expected?.criteria_source ?? {}
  for (const c of res.criteria) {
    const band = exp[c.name]
    if (!Array.isArray(band)) continue
    if ((src[c.name] ?? 'expert') !== 'expert') continue
    if (only.length && !only.includes(c.name)) continue
    const e = c.score === null ? null
      : c.score < band[0] ? c.score - band[0] : c.score > band[1] ? c.score - band[1] : 0
    const missed = c.score === null || Math.abs(e) > TOL
    if (!missed) continue
    console.log(`\n  ${c.name}`)
    console.log(`  expert [${band[0]}, ${band[1]}]   grader ${c.score}   off by ${e > 0 ? '+' : ''}${e.toFixed(1)}`)
    console.log(`  REASONING: ${c.reasoning}`)
    out.push({ fixture: f.slug, criterion: c.name, band, score: c.score, off: e, reasoning: c.reasoning })
  }
  if (res.flags) {
    const fired = Object.entries(res.flags).filter(([, v]) => v).map(([k]) => k)
    if (fired.length) console.log(`\n  FLAGS FIRED: ${fired.join(', ')}`)
  }
}
await db.end()
writeFileSync('/tmp/bias/why.json', JSON.stringify(out, null, 1))
console.log(`\n\nwrote ${out.length} missed cells with reasoning to /tmp/bias/why.json`)
