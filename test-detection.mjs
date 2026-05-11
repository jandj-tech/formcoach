import { execSync, spawnSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'

const VIDEOS = [
  '/Users/joseph/Downloads/WhatsApp Video 2026-05-09 at 8.32.36 PM.mp4',
  '/Users/joseph/Downloads/WhatsApp Video 2026-05-09 at 8.30.43 PM.mp4',
  '/Users/joseph/Downloads/WhatsApp Video 2026-05-09 at 8.31.16 PM.mp4',
  '/Users/joseph/Downloads/WhatsApp Video 2026-05-09 at 8.31.56 PM.mp4',
  '/Users/joseph/Downloads/WhatsApp Video 2026-05-09 at 8.32.29 PM.mp4',
  '/Users/joseph/Downloads/WhatsApp Video 2026-05-09 at 8.31.24 PM.mp4',
  '/Users/joseph/Downloads/WhatsApp Video 2026-05-09 at 8.31.49 PM.mp4',
]

const ROUGH_COUNT = 10
const PROBE_COUNT = 30
const REGION_PAD = 0.45
const REGION_MIN_S = 3.5
const RELEASE_BEFORE = 1.7
const RELEASE_AFTER = 0.8
const QUALITY_FRAMES = 5
const TMP = '/tmp/bball-test'

function getDuration(video) {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${video}"`
  ).toString().trim()
  return parseFloat(out)
}

function extractFrame(video, time, outPath, width = 320, height = 180) {
  spawnSync('ffmpeg', [
    '-ss', String(time), '-i', video,
    '-vframes', '1', '-vf', `scale=${width}:${height}`,
    '-q:v', '3', '-y', outPath
  ], { stdio: 'pipe' })
}

async function detectRegion(roughDir, roughTimestamps) {
  const frames = roughTimestamps.map((_, i) => {
    const p = join(roughDir, `rough-${i}.jpg`)
    if (!existsSync(p)) return null
    return readFileSync(p).toString('base64')
  }).filter(Boolean)

  const res = await fetch('http://localhost:3000/api/detect-shot-region', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frames }),
  })
  return await res.json()
}

async function detectRelease(probeDir, probeTimestamps) {
  const frames = probeTimestamps.map((_, i) => {
    const p = join(probeDir, `probe-${i}.jpg`)
    if (!existsSync(p)) return null
    return readFileSync(p).toString('base64')
  }).filter(Boolean)

  const res = await fetch('http://localhost:3000/api/detect-shot-window', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frames }),
  })
  return await res.json()
}

async function testVideo(video, idx) {
  const label = video.split('/').pop().replace('.mp4', '')
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`Video ${idx + 1}: ${label}`)

  if (!existsSync(video)) {
    console.log('  ❌ File not found — skipping')
    return null
  }

  const dir = join(TMP, `v${idx}`)
  mkdirSync(dir, { recursive: true })

  const duration = getDuration(video)
  console.log(`  Duration: ${duration.toFixed(2)}s`)

  // Pass 1: Extract 10 tiny rough frames
  const roughTimestamps = Array.from({ length: ROUGH_COUNT }, (_, i) =>
    (duration / (ROUGH_COUNT + 1)) * (i + 1)
  )

  process.stdout.write('  Extracting rough frames (160×90)...')
  for (let i = 0; i < ROUGH_COUNT; i++) {
    extractFrame(video, roughTimestamps[i], join(dir, `rough-${i}.jpg`), 160, 90)
  }
  console.log(' done')

  process.stdout.write('  Calling region detection API...')
  let roughCenter = 0.6
  try {
    const regionResult = await detectRegion(dir, roughTimestamps)
    roughCenter = Math.max(0, Math.min(100, regionResult.region)) / 100
    console.log(` done → region ${(roughCenter * 100).toFixed(0)}% (${(roughCenter * duration).toFixed(2)}s)`)
  } catch (e) {
    console.log(` ❌ API error: ${e.message} — using 60% fallback`)
  }

  // Pass 2: Extract 30 dense frames around rough region
  const roughCenterTime = roughCenter * duration
  const halfWindow = Math.max(REGION_MIN_S / 2, duration * REGION_PAD)
  const denseStart = Math.max(0, roughCenterTime - halfWindow)
  const denseEnd = Math.min(duration, roughCenterTime + halfWindow)

  console.log(`  Dense region: ${denseStart.toFixed(2)}s → ${denseEnd.toFixed(2)}s (${(denseEnd - denseStart).toFixed(2)}s)`)

  const probeTimestamps = Array.from({ length: PROBE_COUNT }, (_, i) =>
    denseStart + ((denseEnd - denseStart) / (PROBE_COUNT + 1)) * (i + 1)
  )

  process.stdout.write('  Extracting probe frames (320×180)...')
  for (let i = 0; i < PROBE_COUNT; i++) {
    extractFrame(video, probeTimestamps[i], join(dir, `probe-${i}.jpg`))
    if (i % 10 === 9) process.stdout.write(` ${i + 1}`)
  }
  console.log(' done')

  process.stdout.write('  Calling release detection API...')
  let releaseIdx = Math.floor(PROBE_COUNT * 0.6)
  let releaseTime = roughCenterTime
  try {
    const detectionResult = await detectRelease(dir, probeTimestamps)
    releaseIdx = detectionResult.release ?? releaseIdx
    const clamped = Math.max(0, Math.min(PROBE_COUNT - 1, releaseIdx))
    releaseTime = probeTimestamps[clamped]
    console.log(` done`)
  } catch (e) {
    console.log(` ❌ API error: ${e.message}`)
    return null
  }

  const shotStart = Math.max(0, releaseTime - RELEASE_BEFORE)
  const shotEnd = Math.min(duration, releaseTime + RELEASE_AFTER)

  console.log(`  Release: probe frame ${releaseIdx}/${PROBE_COUNT - 1} → ${releaseTime.toFixed(2)}s`)
  console.log(`  Window: ${shotStart.toFixed(2)}s → ${shotEnd.toFixed(2)}s (${(shotEnd - shotStart).toFixed(2)}s)`)

  // Extract sample quality frames from the window
  const sampleTimestamps = Array.from({ length: QUALITY_FRAMES }, (_, i) =>
    shotStart + ((shotEnd - shotStart) / (QUALITY_FRAMES + 1)) * (i + 1)
  )

  process.stdout.write('  Extracting quality frames...')
  for (let i = 0; i < QUALITY_FRAMES; i++) {
    extractFrame(video, sampleTimestamps[i], join(dir, `quality-${i}.jpg`), 640, 360)
  }
  console.log(' done')
  console.log(`  Quality frame timestamps: ${sampleTimestamps.map(t => t.toFixed(2) + 's').join(', ')}`)

  return { dir, label, releaseTime, shotStart, shotEnd, QUALITY_FRAMES }
}

// Run all tests
mkdirSync(TMP, { recursive: true })

const results = []
for (let i = 0; i < VIDEOS.length; i++) {
  const r = await testVideo(VIDEOS[i], i)
  if (r) results.push(r)
}

console.log('\n' + '═'.repeat(60))
console.log(`Tested ${results.length} videos. Quality frames saved to /tmp/bball-test/`)
console.log('Frame paths:')
for (const r of results) {
  console.log(`\n  ${r.label}`)
  console.log(`    Release: ${r.releaseTime.toFixed(2)}s | Window: ${r.shotStart.toFixed(2)}–${r.shotEnd.toFixed(2)}s`)
  for (let i = 0; i < r.QUALITY_FRAMES; i++) {
    console.log(`    ${join(r.dir, `quality-${i}.jpg`)}`)
  }
}
