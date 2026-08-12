// Exercises lib/frame-motion.ts against real clips: does the crop column land on
// the player, and do the frame times actually concentrate on the shot?
// Usage: npx tsx scripts/test-frame-motion.ts <video> [...]
//
// Needs ffmpeg on PATH or ffmpeg-static installed; frames are decoded to raw RGBA
// so the same diffFrames() the browser runs can be fed real pixels.
import { execFileSync } from 'child_process'
import {
  cropCanvasSize,
  diffFrames,
  emptyMotionColumns,
  motionWeightedTimes,
  playerColumn,
} from '../lib/frame-motion'

const PROBE_COUNT = 30
const PROBE_DIM = 320
const FRAME_COUNT = 28

function ffmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('ffmpeg-static') as string
  } catch {
    return 'ffmpeg'
  }
}

function probe(video: string): { w: number; h: number; dur: number } {
  let out = ''
  try {
    execFileSync(ffmpegPath(), ['-i', video], { encoding: 'utf8', stdio: 'pipe' })
  } catch (e) {
    out = String((e as { stderr?: string }).stderr ?? '')
  }
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(out)!
  const s = /Stream #0:\d+.*?, (\d+)x(\d+)/.exec(out)!
  return {
    w: Number(s[1]),
    h: Number(s[2]),
    dur: Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]),
  }
}

/** One frame as raw RGBA at probe resolution, shaped like a canvas ImageData. */
function rgbaFrame(video: string, t: number, w: number, h: number) {
  const buf = execFileSync(
    ffmpegPath(),
    ['-ss', t.toFixed(3), '-i', video, '-vframes', '1',
      '-vf', `scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
    { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] },
  )
  return { data: new Uint8ClampedArray(buf), width: w, height: h }
}

let failures = 0
function check(label: string, ok: boolean, detail: string) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} — ${detail}`)
  if (!ok) failures++
}

for (const video of process.argv.slice(2)) {
  const { w: vw, h: vh, dur } = probe(video)
  const scale = Math.min(1, PROBE_DIM / Math.max(vw, vh))
  const pw = Math.max(1, Math.round(vw * scale))
  const ph = Math.max(1, Math.round(vh * scale))

  const times = Array.from({ length: PROBE_COUNT }, (_, i) => (dur / (PROBE_COUNT + 1)) * (i + 1))
  const cols = emptyMotionColumns(pw)
  const motion: number[] = []
  let prev: ReturnType<typeof rgbaFrame> | null = null
  for (const t of times) {
    const cur = rgbaFrame(video, t, pw, ph)
    motion.push(prev ? diffFrames(prev, cur, cols) : 0)
    prev = cur
  }
  if (motion.length > 1) motion[0] = motion[1]

  console.log(`\n${video.split(/[\\/]/).pop()}  ${vw}x${vh}  ${dur.toFixed(2)}s  probe ${pw}x${ph}`)

  const col = playerColumn(cols, vw, vh, pw)
  const totalMotion = cols.reduce((a, b) => a + b, 0)
  const peakCol = cols.indexOf(Math.max(...cols))
  check('motion found', totalMotion > 0, `${totalMotion} moving samples, busiest column ${peakCol} of ${pw}`)
  check('column produced', col !== null, col ? `x=${col.x} w=${col.width} (${((col.width / vw) * 100) | 0}% of width)` : 'null — would send full frame')

  if (col) {
    const frameScale = Math.min(1, 1280 / Math.max(vw, vh))
    const size = cropCanvasSize(col.width, vw, vh, frameScale)
    const before = Math.round(vw * frameScale) * Math.round(vh * frameScale)
    const after = size.width * size.height
    const peakX = (peakCol / pw) * vw
    check('column covers the busiest motion', peakX >= col.x && peakX <= col.x + col.width,
      `busiest x ${Math.round(peakX)} inside column ${col.x}..${col.x + col.width}`)
    check('token cost not increased', after <= before * 1.02,
      `${(before / 750) | 0} -> ${(after / 750) | 0} tokens per frame, upscale ${size.scale.toFixed(2)}x`)
  }

  // Frame timing: the release is where motion peaks.
  const peakIdx = motion.indexOf(Math.max(...motion))
  const release = times[peakIdx]
  const start = Math.max(0, release - 1.7)
  const end = Math.min(dur, release + 0.8)
  const weighted = motionWeightedTimes(FRAME_COUNT, start, end, times, motion)
  const uniform = Array.from({ length: FRAME_COUNT }, (_, i) => start + ((end - start) / (FRAME_COUNT + 1)) * (i + 1))
  const near = (list: number[]) => list.filter((t) => Math.abs(t - release) <= 0.35).length

  check('times stay inside the window', weighted.every((t) => t >= start - 1e-6 && t <= end + 1e-6), `${start.toFixed(2)}s..${end.toFixed(2)}s`)
  check('times are non-decreasing', weighted.every((t, i) => i === 0 || t >= weighted[i - 1]), 'monotonic')
  check('frames concentrate near the release', near(weighted) >= near(uniform),
    `within 0.35s of release: ${near(uniform)} uniform -> ${near(weighted)} weighted`)
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
