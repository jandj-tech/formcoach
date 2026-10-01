// IDEA 4 — re-extract each fixture's frames in a TIGHTER window around the release.
//
// WHY. The live extraction spans release-1.7s to +0.8s — 2.5 seconds — across 28
// frames. The graded mechanics (ball leaving the pocket through release) take
// roughly 0.4s, so even perfectly even spacing puts only ~4-5 frames on the
// thing being scored; the other ~23 show the wind-up and the held follow-through.
// Verified by eye on shot-156: frames 1-3 contain the entire shot and frames
// 4-27 are a held finish.
//
// A window of release-0.6s to +0.3s puts all 28 frames on the shot itself —
// roughly 3x the evidence for Elbow, Shot Pocket, Guide Hand and Release at
// IDENTICAL token cost, since the frame count does not change.
//
// The risk is real and is why this is measured rather than assumed: a tight
// window can lose the gather (Knees Bent needs the dip) and the held
// follow-through. Both halves are checked in the arm.
//
// Finding the release: a dense strip is sampled from the source video and the
// model is asked which frame shows the ball leaving the hand. One cheap call per
// fixture, cached, so this is paid once.
//
// Usage: npx tsx --env-file=.env.local scripts/eval/reextract.mjs [--window 0.6,0.3]
import { execFileSync } from 'child_process'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'fs'

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name)
  return i !== -1 ? process.argv[i + 1] : dflt
}
const [PRE, POST] = arg('--window', '0.6,0.3').split(',').map(Number)
const FRAMES = 28
const OUT = '.eval-reextract'
const RELEASES = 'scripts/eval/release-times.json'
const TMP = '/tmp/reextract-work'

const { db } = await import('../../lib/db.ts')
const { callVisionModel, detectModel } = await import('../../lib/model-provider.ts')

const fixtures = await db`
  SELECT f.slug, a.video_url FROM eval_fixtures f
  JOIN analyses a ON a.id = f.analysis_id
  WHERE f.active = true AND a.video_url IS NOT NULL ORDER BY f.slug`
await db.end()

mkdirSync(OUT, { recursive: true })
mkdirSync(TMP, { recursive: true })
const releases = existsSync(RELEASES) ? JSON.parse(readFileSync(RELEASES, 'utf8')) : {}
// Per-fixture geometry of the PINNED frames, so re-extraction reproduces it
// exactly. Built by scripts/eval/pinned-dims.json.
const PINNED = JSON.parse(readFileSync('scripts/eval/pinned-dims.json', 'utf8'))

const ffprobe = (f) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim())

let done = 0, skipped = 0, failed = 0
for (const fx of fixtures) {
  const outDir = `${OUT}/${fx.slug}`
  if (existsSync(outDir) && readdirSync(outDir).length >= FRAMES) { skipped++; continue }
  const vid = `${TMP}/${fx.slug}.mp4`
  try {
    if (!existsSync(vid)) {
      const res = await fetch(fx.video_url, { signal: AbortSignal.timeout(180_000) })
      if (!res.ok) throw new Error(`video fetch ${res.status}`)
      writeFileSync(vid, Buffer.from(await res.arrayBuffer()))
    }
    const dur = ffprobe(vid)

    // Locate the release once, then cache it.
    if (releases[fx.slug] === undefined) {
      const strip = `${TMP}/${fx.slug}-strip`
      mkdirSync(strip, { recursive: true })
      const N = Number(process.env.STRIP_N ?? 24)
      for (let i = 0; i < N; i++) {
        const t = (dur * (i + 0.5)) / N
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', vid, '-frames:v', '1',
          '-vf', 'scale=480:-2,format=yuvj420p', `${strip}/${String(i).padStart(2, '0')}.jpg`])
      }
      const imgs = readdirSync(strip).sort().map((f) => readFileSync(`${strip}/${f}`).toString('base64'))
      const res = await callVisionModel({
        model: detectModel(),
        framesBase64: imgs,
        frameMimeTypes: imgs.map(() => 'image/jpeg'),
        userText: `These ${N} images are evenly spaced through one basketball video, numbered 0 to ${N - 1} in order.

Identify the RELEASE by bracketing it, which is more reliable than naming one frame:

  "last_held"  = the HIGHEST-numbered image in which the ball is still touching the shooter's hand(s).
  "first_free" = the LOWEST-numbered image in which the ball is clearly separated from both hands, with visible gap.

first_free should normally be last_held + 1. The release lies between them.
Ignore any ball resting on the floor or held before the shooting motion begins; judge only the ball being shot.

Answer JSON only: {"last_held": <0-${N - 1}>, "first_free": <0-${N - 1}>, "confident": <true|false>}`,
        maxTokens: 4000,
      })
      const m = res.text.match(/\{[\s\S]*\}/)
      const parsed = m ? JSON.parse(m[0]) : {}
      const held = Number(parsed.last_held)
      const free = Number(parsed.first_free)
      const ok =
        Number.isFinite(held) && Number.isFinite(free) &&
        held >= 0 && free < N && free > held && free - held <= 3 &&
        parsed.confident !== false
      // The release sits between the two bracketing samples, so take the
      // midpoint rather than either endpoint. This is what fixes the
      // systematic lateness: naming one frame made the model pick a frame
      // where the ball was already unambiguously airborne.
      releases[fx.slug] = ok ? (dur * ((held + free) / 2 + 0.5)) / N : null
      if (!ok) console.log(`${fx.slug}: bracket rejected (${res.text.slice(0, 80).replace(/\n/g, ' ')})`)
      writeFileSync(RELEASES, JSON.stringify(releases, null, 1))
      rmSync(strip, { recursive: true, force: true })
    }

    const rel = releases[fx.slug]
    if (rel === null) { console.log(`${fx.slug}: release not found, skipping`); failed++; continue }

    const dims = PINNED[fx.slug]
    if (!dims) { console.log(`${fx.slug}: no pinned dimensions, skipping`); failed++; continue }
    const start = Math.max(0, rel - PRE)
    const end = Math.min(dur, rel + POST)
    mkdirSync(outDir, { recursive: true })
    for (let i = 0; i < FRAMES; i++) {
      const t = start + ((end - start) * i) / (FRAMES - 1)
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', vid, '-frames:v', '1',
        // Some source clips are tagged limited-range YUV, which the mjpeg
        // encoder refuses outright ("Non full-range YUV is non-standard").
        // Forcing the full-range pixel format costs nothing on clips that
        // already comply and is the difference between 27 and 28 fixtures.
        //
        // SCALED TO THE PINNED FRAMES' EXACT GEOMETRY. Extracting at source
        // resolution confounded the whole experiment: 10 of 28 fixtures came
        // out larger than their pinned counterparts (shot-208 at 2160x3840
        // against a pinned 576x1024), so the arm was testing a tighter time
        // window AND more pixels at once, and shot-208 blew the provider's
        // 30MB image limit outright. The window is the variable under test;
        // resolution must be held identical or the result means nothing.
        '-vf', `scale=${dims.w}:${dims.h}`,
        '-pix_fmt', 'yuvj420p', '-q:v', '3', `${outDir}/${String(i).padStart(2, '0')}.jpg`])
    }
    console.log(`${fx.slug}: release ${rel.toFixed(2)}s, window ${start.toFixed(2)}-${end.toFixed(2)}s, ${FRAMES} frames`)
    done++
  } catch (err) {
    console.log(`${fx.slug}: FAILED ${String(err.message).slice(0, 110)}`)
    failed++
  }
}
console.log(`\n${done} re-extracted, ${skipped} already present, ${failed} failed -> ${OUT}/`)
