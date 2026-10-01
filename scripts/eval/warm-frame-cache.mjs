// Pre-downloads every active fixture's frames into the on-disk cache.
//
// Frame downloads have been the largest single source of lost fixtures: 784
// fetches per arm, each one able to kill a whole fixture, and a lost fixture
// makes the entire arm non-comparable to every other arm. One arm lost 27 of
// 28 that way; a 3-pass arm lost 13 of 28.
//
// The frames are pinned and immutable, so fetching them once and reusing them
// removes that failure mode completely. Run this before a sweep; afterwards
// arms make zero frame requests.
//
// Usage: npx tsx --env-file=.env.local scripts/eval/warm-frame-cache.mjs
import { createHash } from 'crypto'
import { mkdirSync, writeFileSync, existsSync } from 'fs'

const DIR = process.env.EVAL_FRAME_CACHE ?? '.eval-frame-cache'
const { db } = await import('../../lib/db.ts')

const fixtures = await db`
  SELECT slug, frame_urls FROM eval_fixtures WHERE active = true ORDER BY slug
`
mkdirSync(DIR, { recursive: true })

const pathFor = (url) => `${DIR}/${createHash('sha256').update(url).digest('hex')}.b64`

let already = 0
let fetched = 0
const failures = []

for (const f of fixtures) {
  const urls = f.frame_urls ?? []
  let got = 0
  for (const url of urls) {
    if (existsSync(pathFor(url))) {
      already++
      got++
      continue
    }
    // More attempts and longer backoff than the inline path: this runs once,
    // unattended, and an extra minute here saves a whole arm later.
    let ok = false
    for (let attempt = 0; attempt < 8 && !ok; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, Math.min(15000, 500 * 2 ** attempt)))
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(45_000) })
        if (!res.ok) {
          if (res.status === 404) break // permanent; stop retrying
          continue
        }
        writeFileSync(pathFor(url), Buffer.from(await res.arrayBuffer()).toString('base64'))
        ok = true
        fetched++
        got++
      } catch {
        /* retry */
      }
    }
    if (!ok) failures.push(`${f.slug}: ${url}`)
  }
  console.log(`${f.slug.padEnd(12)} ${got}/${urls.length} frames cached`)
}

await db.end()
console.log(`\n${already} already cached, ${fetched} newly fetched, ${failures.length} unavailable`)
if (failures.length > 0) {
  console.log('\nUNAVAILABLE — these fixtures will still lose frames:')
  for (const f of failures.slice(0, 20)) console.log(`  ${f}`)
  process.exit(1)
}
console.log('cache warm: arms will now make zero frame requests')
