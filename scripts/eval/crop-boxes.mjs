// Asks the vision model where the shooter is, once per fixture, and caches the box.
//
// WHY: three rubric generations have failed on the same wall — the shooter is
// roughly a fifth of the frame height, so the ball is ~21px, the hand ~15px and a
// finger ~3px against 8px JPEG blocking. Rubric prose cannot fix a distinction
// that is not in the image. Cropping to the shooter is the one intervention that
// changes what the model can SEE rather than how we describe it, and
// lib/frame-extraction.ts already records that "the arithmetic works" — cropping
// was disabled only because locating the player by FRAME DIFFERENCING fails on
// panned or handheld clips (the moving pixels become the whole background and the
// crop cut a real submission's player out of shot entirely). That comment names
// the fix: the box has to come from the detector that already looks at these
// frames. This is that detector.
//
// Boxes are VALIDATED before use, because a wrong crop is far worse than a wide
// frame. A box that covers almost the whole frame buys nothing; a tiny one is
// almost certainly a misread. Both are rejected and the fixture stays uncropped.
//
// Usage: npx tsx --env-file=.env.local scripts/eval/crop-boxes.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { createHash } from 'crypto'

const CACHE = process.env.EVAL_FRAME_CACHE ?? '.eval-frame-cache'
const OUT = 'scripts/eval/crop-boxes.json'
const { db } = await import('../../lib/db.ts')
const { callVisionModel } = await import('../../lib/model-provider.ts')
const { detectModel } = await import('../../lib/model-provider.ts')

const pathFor = (u) => `${CACHE}/${createHash('sha256').update(u).digest('hex')}.b64`
const boxes = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}

const fixtures = await db`SELECT slug, frame_urls FROM eval_fixtures WHERE active = true ORDER BY slug`
await db.end()

const PROMPT = `These frames are consecutive moments from one basketball shot, in order.

Find the SHOOTER — the single player who takes the shot. Report the smallest
rectangle that contains that player's whole body, from the highest point the
ball or hands reach down to their feet, across EVERY frame shown. The box must
cover where they are in all of these frames, not just one.

Answer with JSON only, using fractions of the image from 0 to 1:
{"x0": <left>, "y0": <top>, "x1": <right>, "y1": <bottom>, "confident": <true|false>}

x0 is the left edge as a fraction of width, y0 the top as a fraction of height.
Set "confident" false if you cannot tell which player shoots, if the camera moves
so much that no single box covers them, or if you cannot see a shooter at all.
Be generous rather than tight — cutting off a hand or a foot is much worse than
including extra background.`

let done = 0, skipped = 0, failed = 0
for (const f of fixtures) {
  if (boxes[f.slug]) { done++; continue }
  const urls = f.frame_urls ?? []
  // Four frames spread across the clip: enough to span the player's travel
  // without paying for 28 images per fixture.
  const picks = [0, Math.floor(urls.length * 0.33), Math.floor(urls.length * 0.66), urls.length - 1]
    .map((i) => urls[i])
    .filter((u) => u && existsSync(pathFor(u)))
  if (picks.length < 2) { console.log(`${f.slug}: frames not cached`); failed++; continue }
  const framesBase64 = picks.map((u) => readFileSync(pathFor(u), 'utf8'))
  try {
    const res = await callVisionModel({
      model: detectModel(),
      framesBase64,
      frameMimeTypes: framesBase64.map(() => 'image/jpeg'),
      userText: PROMPT,
      maxTokens: 4000,
    })
    const m = res.text.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('no JSON in reply')
    const b = JSON.parse(m[0])
    const w = b.x1 - b.x0, h = b.y1 - b.y0
    // VALIDATION. Each rejection leaves the fixture uncropped, which is the
    // safe default — a wide frame grades worse than a tight one but a crop that
    // misses the player grades nothing at all.
    const why =
      b.confident === false ? 'model not confident'
      : !(w > 0 && h > 0) ? 'degenerate box'
      : w * h > 0.8 ? 'box covers >80% of frame — nothing to gain'
      : w * h < 0.01 ? 'box under 1% of frame — almost certainly a misread'
      : h < 0.15 ? 'box under 15% of frame height — too short to be a standing player'
      : null
    if (why) { console.log(`${f.slug}: SKIP (${why}) ${JSON.stringify(b)}`); boxes[f.slug] = { skip: why }; skipped++ }
    else {
      const gain = Math.sqrt(1 / (w * h))
      console.log(`${f.slug}: box ${w.toFixed(2)}x${h.toFixed(2)} of frame — ~${gain.toFixed(1)}x linear gain`)
      boxes[f.slug] = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }
      done++
    }
  } catch (err) {
    console.log(`${f.slug}: FAILED ${err.message.slice(0, 120)}`)
    failed++
  }
  writeFileSync(OUT, JSON.stringify(boxes, null, 1))
}
console.log(`\n${done} boxed, ${skipped} skipped, ${failed} failed -> ${OUT}`)
