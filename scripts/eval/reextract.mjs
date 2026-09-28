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
      const N = 12
      for (let i = 0; i < N; i++) {
        const t = (dur * (i + 0.5)) / N
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', vid, '-frames:v', '1',
          '-vf', 'scale=480:-2', `${strip}/${String(i).padStart(2, '0')}.jpg`])
      }
      const imgs = readdirSync(strip).sort().map((f) => readFileSync(`${strip}/${f}`).toString('base64'))
      const res = await callVisionModel({
        model: detectModel(),
        framesBase64: imgs,
        frameMimeTypes: imgs.map(() => 'image/jpeg'),
        userText: `These ${N} images are evenly spaced through one basketball video, numbered 0 to ${N - 1} in order.

Find the RELEASE: the moment the ball leaves the shooter's hand. Answer with the number of the image where the ball has just left the hand, or is closest to leaving it.

Answer JSON only: {"release": <0-${N - 1}>, "confident": <true|false>}`,
        maxTokens: 4000,
      })
      const m = res.text.match(/\{[\s\S]*\}/)
      const parsed = m ? JSON.parse(m[0]) : {}
      const idx = Number(parsed.release)
      releases[fx.slug] =
        Number.isFinite(idx) && idx >= 0 && idx < N && parsed.confident !== false
          ? (dur * (idx + 0.5)) / N
          : null
      writeFileSync(RELEASES, JSON.stringify(releases, null, 1))
      rmSync(strip, { recursive: true, force: true })
    }

    const rel = releases[fx.slug]
    if (rel === null) { console.log(`${fx.slug}: release not found, skipping`); failed++; continue }

    const start = Math.max(0, rel - PRE)
    const end = Math.min(dur, rel + POST)
    mkdirSync(outDir, { recursive: true })
    for (let i = 0; i < FRAMES; i++) {
      const t = start + ((end - start) * i) / (FRAMES - 1)
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', vid, '-frames:v', '1',
        '-q:v', '3', `${outDir}/${String(i).padStart(2, '0')}.jpg`])
    }
    console.log(`${fx.slug}: release ${rel.toFixed(2)}s, window ${start.toFixed(2)}-${end.toFixed(2)}s, ${FRAMES} frames`)
    done++
  } catch (err) {
    console.log(`${fx.slug}: FAILED ${String(err.message).slice(0, 110)}`)
    failed++
  }
}
console.log(`\n${done} re-extracted, ${skipped} already present, ${failed} failed -> ${OUT}/`)
