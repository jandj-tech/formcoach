// Renders a fixture's pinned frames as a strip so a miss can be inspected by
// eye. Kept as a real tool rather than a throwaway: several conclusions this
// project reached from numbers alone were wrong, and two were caught only by
// looking at the frames (a crop validated in code that was the wrong shape, and
// a "frame allocation bug" that turned out to be correct-by-design).
//
// Usage: npx tsx --env-file=.env.local scripts/eval/contact-sheet.mjs <slug> [from] [to] [--crop]
import { readFileSync, existsSync } from 'fs'
import { createHash } from 'crypto'
const { default: sharp } = await import('sharp')
const { db } = await import('../../lib/db.ts')

const args = process.argv.slice(2)
const slug = args[0]
const from = Number(args[1] ?? 0)
const to = Number(args[2] ?? 28)
const tight = args.includes('--crop')
const CACHE = process.env.EVAL_FRAME_CACHE ?? '.eval-frame-cache'
const pathFor = (u) => `${CACHE}/${createHash('sha256').update(u).digest('hex')}.b64`

const fx = await db`SELECT frame_urls, expected FROM eval_fixtures WHERE slug = ${slug}`
await db.end()
if (fx.length === 0) { console.error(`no fixture ${slug}`); process.exit(1) }

const urls = (fx[0].frame_urls ?? []).slice(from, to)
const tiles = []
for (const u of urls) {
  if (!existsSync(pathFor(u))) continue
  const buf = Buffer.from(readFileSync(pathFor(u), 'utf8'), 'base64')
  let img = sharp(buf)
  if (tight) {
    const m = await img.metadata()
    // Centre half, upper two-thirds — where a shooter almost always is. Crude
    // on purpose: this is for looking, not for grading.
    img = sharp(buf).extract({
      left: Math.round(m.width * 0.25), top: 0,
      width: Math.round(m.width * 0.5), height: Math.round(m.height * 0.66),
    })
  }
  tiles.push(await img.resize(190, 330, { fit: 'contain', background: '#111' }).jpeg({ quality: 90 }).toBuffer())
}
const out = `/tmp/bias/cs-${slug}-${from}-${to}${tight ? '-crop' : ''}.jpg`
await sharp({ create: { width: 190 * tiles.length, height: 330, channels: 3, background: '#000' } })
  .composite(tiles.map((b, i) => ({ input: b, left: i * 190, top: 0 })))
  .jpeg({ quality: 90 }).toFile(out)
console.log(`${out}  (${tiles.length} frames, ${from}-${to - 1})`)
const band = fx[0].expected?.criteria ?? {}
for (const k of ['Square to the Basket', 'Source of Shot Power', 'Elbow L-Shape — Under the Ball'])
  if (band[k]) console.log(`  expert ${k}: [${band[k][0]}, ${band[k][1]}]`)
