import { execSync, spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const PROBE_COUNT = 30
const FRAME_COUNT = 20
const OUT_DIR = '/tmp/shot-frames'

const VIDEOS = [
  '/Users/joseph/Downloads/WhatsApp Video 2026-05-09 at 8.32.36 PM.mp4',
  '/Users/joseph/Downloads/WhatsApp Video 2026-05-09 at 8.30.43 PM.mp4',
  '/Users/joseph/Downloads/WhatsApp Video 2026-05-09 at 8.31.16 PM.mp4',
  '/Users/joseph/Downloads/WhatsApp Video 2026-05-09 at 8.31.56 PM.mp4',
]

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

function getDuration(videoPath) {
  const result = spawnSync('ffprobe', [
    '-v', 'quiet', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', videoPath
  ])
  return parseFloat(result.stdout.toString().trim())
}

function extractFrame(videoPath, timestamp, width, height, outPath) {
  spawnSync('ffmpeg', [
    '-ss', String(timestamp),
    '-i', videoPath,
    '-vframes', '1',
    '-vf', `scale=${width}:${height}`,
    '-q:v', '2',
    '-y', outPath
  ], { stdio: 'pipe' })
}

function readAsBase64(filePath) {
  return fs.readFileSync(filePath).toString('base64')
}

async function detectShotStart(probeBase64Array, n) {
  const imageBlocks = probeBase64Array.map(data => ({
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data },
  }))

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: [
        ...imageBlocks,
        {
          type: 'text',
          text: `These are ${n} evenly-spaced frames numbered 0 to ${n - 1} from a basketball video. There may be multiple shots in the video.

Find the frame showing the PEAK of the FIRST shot — the single moment where:
- The shooter's arm is at its HIGHEST point, fully extended straight up overhead
- The ball is at the very top of its release — either still on the fingertips or just leaving the hand
- The wrist is snapping or has just snapped downward

This is the most visually distinctive moment: arms straight up, body fully extended or at the top of the jump. There is exactly one peak per shot.

If there are multiple shots, use the FIRST shot only (earliest frames).

Do not explain your reasoning. Output ONLY the JSON object, nothing else: {"peak": <frame number 0 to ${n - 1}>}`
        }
      ]
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const match = text.match(/\{[\s\S]*?\}/)
  if (!match) return 0
  const parsed = JSON.parse(match[0])
  return Math.max(0, Math.min(n - 1, Number(parsed.peak ?? parsed.start ?? 0)))
}

async function testVideo(videoPath, videoIndex) {
  const name = path.basename(videoPath)
  console.log(`\n${'='.repeat(60)}`)
  console.log(`VIDEO ${videoIndex + 1}: ${name}`)
  console.log('='.repeat(60))

  const duration = getDuration(videoPath)
  console.log(`Duration: ${duration.toFixed(2)}s`)

  const videoOutDir = path.join(OUT_DIR, `video${videoIndex + 1}`)
  fs.mkdirSync(videoOutDir, { recursive: true })

  // Extract probe frames
  console.log(`Extracting ${PROBE_COUNT} probe frames...`)
  const probeTimestamps = Array.from({ length: PROBE_COUNT }, (_, i) =>
    (duration / (PROBE_COUNT + 1)) * (i + 1)
  )

  const probeBase64 = []
  for (let i = 0; i < PROBE_COUNT; i++) {
    const outPath = path.join(videoOutDir, `probe_${i}.jpg`)
    extractFrame(videoPath, probeTimestamps[i], 320, 180, outPath)
    if (fs.existsSync(outPath)) {
      probeBase64.push(readAsBase64(outPath))
    }
  }
  console.log(`Extracted ${probeBase64.length} probe frames`)

  // Detect shot start
  console.log('Calling Claude Haiku to detect shot start...')
  const startIdx = await detectShotStart(probeBase64, PROBE_COUNT) // now returns peak frame
  const peakTime = probeTimestamps[startIdx]
  const shotStart = Math.max(0, peakTime - 1.5)
  const shotEnd = Math.min(duration, peakTime + 1.0)

  console.log(`Detected start frame: ${startIdx} (t=${shotStart.toFixed(2)}s)`)
  console.log(`Window: ${shotStart.toFixed(2)}s → ${shotEnd.toFixed(2)}s (${(shotEnd - shotStart).toFixed(2)}s)`)

  // Extract final frames
  console.log(`Extracting ${FRAME_COUNT} final frames...`)
  const timestamps = Array.from({ length: FRAME_COUNT }, (_, i) =>
    shotStart + ((shotEnd - shotStart) / (FRAME_COUNT + 1)) * (i + 1)
  )

  for (let i = 0; i < timestamps.length; i++) {
    const outPath = path.join(videoOutDir, `frame_${String(i + 1).padStart(2, '0')}_t${timestamps[i].toFixed(2)}s.jpg`)
    extractFrame(videoPath, timestamps[i], 640, 360, outPath)
  }

  console.log(`\nFrames saved to: ${videoOutDir}`)
  console.log(`Frame timestamps:`)
  timestamps.forEach((t, i) => {
    const inShot = t >= shotStart && t <= shotEnd
    console.log(`  Frame ${String(i+1).padStart(2,'0')}: t=${t.toFixed(2)}s`)
  })

  // Open the frames
  spawnSync('open', [videoOutDir])
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  for (let i = 0; i < VIDEOS.length; i++) {
    await testVideo(VIDEOS[i], i)
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log('Done! Check Finder windows for each video\'s frames.')
  console.log(OUT_DIR)
}

main().catch(console.error)
