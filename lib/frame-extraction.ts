'use client'

import {
  diffFrames,
  emptyMotionColumns,
  motionWeightedTimes,
} from '@/lib/frame-motion'

/**
 * Client-side frame extraction, shared by the single uploader and the bulk
 * uploader. Lifted out of components/VideoUploader.tsx unchanged — every
 * workaround in here was found against a real device, so treat the sequencing
 * (play-nudge, double rAF after seek, black-frame retry, seek quantization) as
 * load-bearing rather than defensive.
 */

export interface ExtractOptions {
  /** Team code passed through to /api/detect-shot-window. */
  teamCode?: string | null
  /** 0-65, the share of the whole upload that extraction represents. */
  onProgress?: (pct: number) => void
  onStatus?: (status: string) => void
  onPreviews?: (thumbs: string[]) => void
  onNoShot?: (noShot: boolean) => void
  onError?: (message: string) => void
  /** Return true to abandon extraction at the next frame boundary. */
  isCancelled?: () => boolean
}

const FRAME_COUNT = 28
const ROUGH_COUNT = 10      // tiny frames for rough shot location
const PROBE_COUNT = 30      // low-res frames for precise release detection
const REGION_PAD = 0.40     // ±40% of video around rough center
const REGION_MIN_S = 5.0    // minimum dense region width — covers full short videos
const SEEK_TIMEOUT_MS = 4000  // max ms to wait for a seek before skipping

// Every seek target is snapped to a fixed 30fps grid before it reaches the
// decoder. The rough/probe/final timestamps come out of float math (duration
// fractions, motion weighting) that can differ in the 4th decimal between two
// uploads of the same file; unquantized, those hairline differences decode
// different frames, the frame bytes change, and the server's frames-hash
// dedup misses — so the same video gets a fresh grade. Snapping to the grid
// (plus a quarter-frame nudge so the target sits inside the intended frame
// interval, not on its ambiguous boundary) makes the same decisions converge
// on identical frames on the same device.
const SEEK_GRID_FPS = 30
const quantizeSeek = (t: number) =>
  Math.round(t * SEEK_GRID_FPS) / SEEK_GRID_FPS + 1 / (SEEK_GRID_FPS * 4)

// True if the canvas holds an essentially solid-black image — the signature of
// a frame the browser handed back before its video decoder was ready (common
// on iOS/Android until the <video> has been played once).
function isBlackFrame(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const { data } = ctx.getImageData(0, 0, w, h)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 14 || data[i + 1] > 14 || data[i + 2] > 14) return false
  }
  return true
}

// Vercel rejects request bodies larger than 4.5MB with HTTP 413. The analyze
// upload carries every extracted frame, so the batch is re-encoded here — in
// escalating steps — until it fits comfortably under that limit.
const UPLOAD_BUDGET_BYTES = 3.8 * 1024 * 1024

function totalBytes(blobs: Blob[]): number {
  return blobs.reduce((sum, b) => sum + b.size, 0)
}

async function reencodeFrames(
  frames: Blob[],
  quality: number,
  scale: number,
): Promise<Blob[]> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const out: Blob[] = []
  for (const frame of frames) {
    const bitmap = await createImageBitmap(frame)
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    out.push(
      await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Frame re-encode failed'))),
          'image/jpeg',
          quality,
        )
      }),
    )
  }
  return out
}

// Returns a frame batch guaranteed to fit under UPLOAD_BUDGET_BYTES (so the
// analyze upload can never trigger an HTTP 413), plus whether the batch had to
// give up RESOLUTION to get there — `reduced: true` means analysis quality is
// genuinely lower. The full-resolution JPEG re-encode steps are normal for any
// modern phone video (4K frames always start over budget) and cost no real
// accuracy, so they must NOT trigger the quality warning — that screen was
// firing on every iPhone clip and reading as "your video is too big".
export async function fitFramesToBudget(
  frames: Blob[],
): Promise<{ frames: Blob[]; reduced: boolean }> {
  if (totalBytes(frames) <= UPLOAD_BUDGET_BYTES) return { frames, reduced: false }
  // Each step re-encodes from the original frames (no compounding artifacts),
  // dropping quality first and then resolution until the batch is small enough.
  const steps = [
    { quality: 0.7, scale: 1, lossy: false },
    { quality: 0.55, scale: 1, lossy: false },
    { quality: 0.5, scale: 0.8, lossy: true },
    { quality: 0.42, scale: 0.65, lossy: true },
    { quality: 0.35, scale: 0.5, lossy: true },
  ]
  let current = frames
  for (const step of steps) {
    current = await reencodeFrames(frames, step.quality, step.scale)
    if (totalBytes(current) <= UPLOAD_BUDGET_BYTES) {
      return { frames: current, reduced: step.lossy }
    }
  }
  // Still over budget at the smallest step — definitely degraded.
  return { frames: current, reduced: true }
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    let done = false
    const finish = () => { if (!done) { done = true; res() } }
    const timer = setTimeout(finish, SEEK_TIMEOUT_MS)
    video.onseeked = () => {
      clearTimeout(timer)
      // Double rAF ensures the browser has decoded and painted the new frame
      // before we drawImage — without this, some formats return the previous frame
      requestAnimationFrame(() => requestAnimationFrame(() => finish()))
    }
    video.currentTime = quantizeSeek(t)
  })
}

// Progress is reported 0-65 because extraction is only the first two thirds of
// an upload; the caller owns the rest of the bar.
function reportFactory(opts: ExtractOptions) {
  return (pct: number) => opts.onProgress?.(pct)
}

async function extractFramesUnsynchronized(
  file: File,
  opts: ExtractOptions
): Promise<Blob[]> {
  const report = reportFactory(opts)
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    // iOS Safari only decodes frames into a <canvas> when the <video> is
    // attached to the DOM and carries these attributes — otherwise every
    // drawImage() returns solid black. Keep it on the page but invisible.
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    video.setAttribute('muted', '')
    video.style.cssText =
      'position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;'
    document.body.appendChild(video)

    const url = URL.createObjectURL(file)

    const cleanup = () => {
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      try { video.load() } catch {}
      video.remove()
    }

    video.onerror = () => {
      cleanup()
      reject(new Error('Failed to load video'))
    }

    video.onloadedmetadata = async () => {
     try {
      const duration = video.duration
      if (!duration || !isFinite(duration) || !video.videoWidth || !video.videoHeight) {
        cleanup()
        reject(new Error('Could not read this video. Please try a different file.'))
        return
      }

      // --- Phase 1a: Extract tiny rough frames for shot location ---
      // Size the detection canvas to the video's true aspect ratio. Forcing
      // a portrait or square clip into a fixed 16:9 canvas squashes the
      // player and wrecks the AI's ability to locate the shot.
      const roughCanvas = document.createElement('canvas')
      const roughScale = Math.min(1, 160 / Math.max(video.videoWidth, video.videoHeight))
      const roughW = Math.max(1, Math.round(video.videoWidth * roughScale))
      const roughH = Math.max(1, Math.round(video.videoHeight * roughScale))
      roughCanvas.width = roughW
      roughCanvas.height = roughH
      const roughCtx = roughCanvas.getContext('2d', { willReadFrequently: true })!

      // Wake the video decoder. Mobile browsers (iOS especially) won't paint
      // frames to a canvas until the video has actually played; muted
      // playback is allowed without a user gesture. Play a beat, pause, and
      // verify a real frame comes back — retry the nudge if it's still black.
      let decoderReady = false
      const probeTime = Math.min(duration * 0.5, Math.max(0, duration - 0.1))
      for (let attempt = 0; attempt < 3 && !decoderReady; attempt++) {
        try {
          await video.play()
          await new Promise<void>(r => setTimeout(r, 140))
          video.pause()
        } catch {
          // play() can be refused; extraction may still work on desktop.
        }
        await seekTo(video, probeTime)
        roughCtx.drawImage(video, 0, 0, roughW, roughH)
        decoderReady = !isBlackFrame(roughCtx, roughW, roughH)
      }

      const roughTimestamps = Array.from({ length: ROUGH_COUNT }, (_, i) =>
        (duration / (ROUGH_COUNT + 1)) * (i + 1)
      )

      const roughBase64: string[] = []
      for (let i = 0; i < ROUGH_COUNT; i++) {
        await seekTo(video, roughTimestamps[i])
        roughCtx.drawImage(video, 0, 0, roughW, roughH)
        roughBase64.push(roughCanvas.toDataURL('image/jpeg', 0.6).split(',')[1])
        report(Math.round(((i + 1) / ROUGH_COUNT) * 10))
      }

      // --- Phase 1b: Get rough shot region (which part of video has the shot) ---
      let roughCenter = 0.6
      try {
        const regionRes = await fetch('/api/detect-shot-region', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frames: roughBase64, teamCode: opts.teamCode ?? null }),
        })
        if (regionRes.ok) {
          const { region } = await regionRes.json()
          roughCenter = Math.max(0, Math.min(100, region)) / 100
        }
      } catch {}

      report(20)

      // --- Phase 1c: Extract dense probe frames around rough region ---
      const probeCanvas = document.createElement('canvas')
      const probeScale = Math.min(1, 320 / Math.max(video.videoWidth, video.videoHeight))
      const probeW = Math.max(1, Math.round(video.videoWidth * probeScale))
      const probeH = Math.max(1, Math.round(video.videoHeight * probeScale))
      probeCanvas.width = probeW
      probeCanvas.height = probeH
      // willReadFrequently: this pass now calls getImageData on every probe to
      // measure motion, which is slow on a GPU-backed canvas.
      const probeCtx = probeCanvas.getContext('2d', { willReadFrequently: true })!

      // Dense region: roughCenter ± 40%, minimum 5s total
      // Min 5s covers most short single-shot clips entirely regardless of rough accuracy
      const roughCenterTime = roughCenter * duration
      const halfWindow = Math.max(REGION_MIN_S / 2, duration * REGION_PAD)
      const denseStart = Math.max(0, roughCenterTime - halfWindow)
      const denseEnd = Math.min(duration, roughCenterTime + halfWindow)

      const probeTimestamps = Array.from({ length: PROBE_COUNT }, (_, i) =>
        denseStart + ((denseEnd - denseStart) / (PROBE_COUNT + 1)) * (i + 1)
      )

      const probeBase64: string[] = []
      // Motion per probe frame, and the box bounding everything that moved.
      const probeMotion: number[] = []
      const motionColumns = emptyMotionColumns(probeW)
      let prevProbe: ImageData | null = null
      for (let i = 0; i < PROBE_COUNT; i++) {
        await seekTo(video, probeTimestamps[i])
        probeCtx.drawImage(video, 0, 0, probeW, probeH)
        probeBase64.push(probeCanvas.toDataURL('image/jpeg', 0.7).split(',')[1])
        const cur = probeCtx.getImageData(0, 0, probeW, probeH)
        // The first probe has nothing to diff against; it inherits the second's
        // score below so the profile stays the same length as the timestamps.
        probeMotion.push(prevProbe ? diffFrames(prevProbe, cur, motionColumns) : 0)
        prevProbe = cur
        report(Math.round(20 + ((i + 1) / PROBE_COUNT) * 15))
      }
      if (probeMotion.length > 1) probeMotion[0] = probeMotion[1]

      // --- Phase 2: Find release frame within dense region ---
      // release - 1.7s covers: gather → shot pocket → jump → release
      // release + 0.8s covers: follow-through + ball in arc
      let releaseTime = roughCenterTime
      let shotStart = Math.max(0, releaseTime - 1.7)
      let shotEnd = Math.min(duration, releaseTime + 0.8)

      try {
        const windowRes = await fetch('/api/detect-shot-window', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frames: probeBase64, teamCode: opts.teamCode ?? null }),
        })
        if (windowRes.ok) {
          const { release } = await windowRes.json()
          const clamped = Math.max(0, Math.min(PROBE_COUNT - 1, release))
          releaseTime = probeTimestamps[clamped]
          shotStart = Math.max(0, releaseTime - 1.7)
          shotEnd = Math.min(duration, releaseTime + 0.8)
        }
      } catch {}

      report(45)

      // --- Phase 3: Extract quality frames from the shot window ---
      const mainCanvas = document.createElement('canvas')
      const ctx = mainCanvas.getContext('2d')!
      const blobs: Blob[] = []
      const thumbs: string[] = []

      // Cap frame resolution. Full-res 1080p/4K phone frames produce a
      // multipart upload that blows past Vercel's 4.5MB request-body limit,
      // which the user only sees as "something went wrong". 1280px on the
      // long edge keeps ample detail for the AI while staying well under it.
      //
      // Env-tunable (build-time): image tokens scale with width × height, so
      // this is the biggest per-analysis cost lever — 1024 is ~-36% image
      // tokens, 896 ~-51%, 768 ~-64%. Lower resolution can hurt the
      // fine-grained checks (fingers, thumb, elbow angle): validate any
      // change with `npm run eval` against the fixture baseline BEFORE
      // adopting it, per fixtures/README.md.
      const MAX_FRAME_DIM =
        Number(process.env.NEXT_PUBLIC_MAX_FRAME_DIM) || 1280
      const frameScale = Math.min(
        1,
        MAX_FRAME_DIM / Math.max(video.videoWidth, video.videoHeight),
      )

      // NOT cropping to the player, deliberately — see lib/frame-motion.ts.
      // Cropping the frame to the shooter would give the grader a much bigger
      // player for the same token cost, and the arithmetic works, but locating him
      // from frame differencing does not: on a panned or handheld clip the moving
      // pixels are the whole background, the tallest column is a frame edge, and
      // the crop cuts the player out of shot entirely. That happened on a real
      // submission — every cropped frame held wall and floor and no player, which
      // is far worse than a wide frame. The box has to come from the detector that
      // already looks at these frames, not from pixel differences.
      mainCanvas.width = Math.round(video.videoWidth * frameScale)
      mainCanvas.height = Math.round(video.videoHeight * frameScale)

      // Weight the frame times by motion rather than spacing them evenly, so the
      // release gets the frames and the still wind-up does not.
      const timestamps = motionWeightedTimes(
        FRAME_COUNT,
        shotStart,
        shotEnd,
        probeTimestamps,
        probeMotion,
      )

      for (let i = 0; i < timestamps.length; i++) {
        if (opts.isCancelled?.()) { cleanup(); resolve(blobs); return }
        await seekTo(video, timestamps[i])
        ctx.drawImage(video, 0, 0, mainCanvas.width, mainCanvas.height)
        await new Promise<void>((res) => {
          mainCanvas.toBlob(
            (blob) => {
              if (blob) {
                blobs.push(blob)
                thumbs.push(mainCanvas.toDataURL('image/jpeg', 0.4))
              }
              report(Math.round(45 + ((i + 1) / timestamps.length) * 20))
              res()
            },
            'image/jpeg',
            0.8
          )
        })
      }

      opts.onPreviews?.(thumbs)
      cleanup()
      resolve(blobs)
     } catch (err) {
      cleanup()
      reject(err instanceof Error ? err : new Error('Frame extraction failed'))
     }
    }

    video.src = url
  })
}

/**
 * Serializes extraction across the whole tab.
 *
 * Frame extraction decodes video into a <canvas>, and browsers give one page a
 * small, shared pool of hardware video decoders. Run two extractions at once
 * and the second one's drawImage() calls return solid black — no error, no
 * warning, just 28 black frames that sail through upload and come back graded
 * as "no shot detected". The bulk uploader made this reachable: 12 clips
 * dropped at once is 12 concurrent decodes.
 *
 * The lock lives with the decoder rather than in the bulk UI on purpose. Any
 * future caller gets the invariant for free, and nobody has to know about it.
 */
let extractionChain: Promise<unknown> = Promise.resolve()

export function extractFrames(file: File, opts: ExtractOptions = {}): Promise<Blob[]> {
  // Chain onto whatever is already extracting, and swallow its outcome so one
  // failed clip cannot reject the next one's turn in the queue.
  const mine = extractionChain
    .catch(() => undefined)
    .then(() => extractFramesUnsynchronized(file, opts))
  extractionChain = mine.catch(() => undefined)
  return mine
}
