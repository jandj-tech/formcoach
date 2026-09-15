/**
 * How long does one analysis actually take, and where does the time go?
 *
 * The eval harness is NOT a good clock for this: it downloads 28 frames from
 * storage first, which production never does — the browser has already
 * extracted them and posts them in the request body. Quoting eval wall-time as
 * "how long a user waits" overstates it.
 *
 * This times the stages separately against a real fixture's frames:
 *   download   — harness-only, subtracted from the user-facing figure
 *   gate       — findReleaseFrame, one vision call, runs before any grading
 *   grading    — the N-pass ensemble, which is what actually costs time
 *
 * Usage:
 *   ANALYSIS_MODEL=qwen/qwen3.7-flash ANALYSIS_PASSES=3 \
 *     npx tsx --env-file=.env.local scripts/eval/time-analysis.ts [slug]
 */
import { db } from '../../lib/db'
import { analyzeShot } from '../../lib/analyze'
import { analysisModel } from '../../lib/model-provider'

async function main() {
  const slug = process.argv[2] || 'shot-201'
  const [fixture] = (await db`
    SELECT slug, frame_urls FROM eval_fixtures WHERE slug = ${slug} AND active = true
  `) as unknown as [{ slug: string; frame_urls: string[] } | undefined]
  if (!fixture) throw new Error(`no active fixture "${slug}"`)

  const passes = parseInt(process.env.ANALYSIS_PASSES || '3', 10) || 3
  console.log(`fixture ${fixture.slug} · ${fixture.frame_urls.length} frames · ${analysisModel()} · ${passes} pass(es)\n`)

  const t0 = Date.now()
  const frames = await Promise.all(
    fixture.frame_urls.map(async (u) => {
      const res = await fetch(u)
      if (!res.ok) throw new Error(`frame fetch ${res.status}`)
      return Buffer.from(await res.arrayBuffer()).toString('base64')
    })
  )
  const tDownload = Date.now() - t0

  const t1 = Date.now()
  const result = await analyzeShot(frames, frames.map(() => 'image/jpeg'), { passes })
  const tAnalyze = Date.now() - t1

  const scored = result.criteria.filter((c) => c.score !== null).length
  const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`

  console.log(`  frame download (harness only, NOT in production) : ${s(tDownload)}`)
  console.log(`  gate + ${passes} grading pass(es)                        : ${s(tAnalyze)}`)
  console.log(`  ${'-'.repeat(52)}`)
  console.log(`  what a user actually waits for the grade          : ${s(tAnalyze)}`)
  console.log(`  (plus their own upload + client-side extraction)\n`)
  console.log(`  shot detected : ${result.shot_detected}`)
  console.log(`  overall       : ${result.overall_score}`)
  console.log(`  criteria      : ${scored} scored, ${result.criteria.length - scored} left ungraded`)
  console.log(`  grader        : ${result.grader_version?.model} @ ${result.grader_version?.passes} pass(es)`)
  process.exit(0)
}

main().catch((e) => {
  console.error('failed:', e instanceof Error ? e.message : e)
  process.exit(1)
})
