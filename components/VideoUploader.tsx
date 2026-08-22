'use client'

import { trackInitiateCheckout } from '@/lib/meta-pixel'
import { useIsInApp } from '@/lib/useIsInApp'
import { analysisUnitCents, usd } from '@/lib/team-pricing'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { upload } from '@vercel/blob/client'

import {
  diffFrames,
  emptyMotionColumns,
  motionWeightedTimes,
} from '@/lib/frame-motion'

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
async function fitFramesToBudget(
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

interface SessionUser { id: string; email: string; tokens: number; subscribed: boolean; onTeam: boolean; onInitiatedTeam: boolean; freeUpload: boolean }

interface TeamMode {
  code: string
  firstName: string
  lastName: string
  onSuccess: (submissionId: string) => void
}

export default function VideoUploader({ teamMode, coachSelf, coachCredits }: { teamMode?: TeamMode; coachSelf?: boolean; coachCredits?: number } = {}) {
  const inApp = useIsInApp()
  const [isDragging, setIsDragging] = useState(false)
  const [status, setStatus] = useState<'idle' | 'extracting' | 'uploading' | 'quality-warning' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [previews, setPreviews] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  // Set when the server reports the video contained no analyzable shot.
  const [noShot, setNoShot] = useState(false)
  const [videoUploadStatus, setVideoUploadStatus] = useState<
    { state: 'idle' } | { state: 'uploading' } | { state: 'ok'; url: string } | { state: 'failed'; error: string }
  >({ state: 'idle' })
  const [sessionUser, setSessionUser] = useState<SessionUser | null | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelledRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  // Resolves the quality-warning prompt: true = continue, false = re-record.
  const confirmResolverRef = useRef<((proceed: boolean) => void) | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (teamMode || coachSelf) return
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(({ user }) => setSessionUser(user ?? null))
      .catch(() => setSessionUser(null))
  }, [teamMode, coachSelf])

  const seekTo = (video: HTMLVideoElement, t: number): Promise<void> =>
    new Promise((res) => {
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

  const extractFrames = useCallback(async (file: File): Promise<Blob[]> => {
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
          setProgress(Math.round(((i + 1) / ROUGH_COUNT) * 10))
        }

        // --- Phase 1b: Get rough shot region (which part of video has the shot) ---
        let roughCenter = 0.6
        try {
          const regionRes = await fetch('/api/detect-shot-region', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ frames: roughBase64, teamCode: teamMode?.code ?? null }),
          })
          if (regionRes.ok) {
            const { region } = await regionRes.json()
            roughCenter = Math.max(0, Math.min(100, region)) / 100
          }
        } catch {}

        setProgress(20)

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
          setProgress(Math.round(20 + ((i + 1) / PROBE_COUNT) * 15))
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
            body: JSON.stringify({ frames: probeBase64, teamCode: teamMode?.code ?? null }),
          })
          if (windowRes.ok) {
            const { release } = await windowRes.json()
            const clamped = Math.max(0, Math.min(PROBE_COUNT - 1, release))
            releaseTime = probeTimestamps[clamped]
            shotStart = Math.max(0, releaseTime - 1.7)
            shotEnd = Math.min(duration, releaseTime + 0.8)
          }
        } catch {}

        setProgress(45)

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
          if (cancelledRef.current) { cleanup(); resolve(blobs); return }
          await seekTo(video, timestamps[i])
          ctx.drawImage(video, 0, 0, mainCanvas.width, mainCanvas.height)
          await new Promise<void>((res) => {
            mainCanvas.toBlob(
              (blob) => {
                if (blob) {
                  blobs.push(blob)
                  thumbs.push(mainCanvas.toDataURL('image/jpeg', 0.4))
                }
                setProgress(Math.round(45 + ((i + 1) / timestamps.length) * 20))
                res()
              },
              'image/jpeg',
              0.8
            )
          })
        }

        setPreviews(thumbs)
        cleanup()
        resolve(blobs)
       } catch (err) {
        cleanup()
        reject(err instanceof Error ? err : new Error('Frame extraction failed'))
       }
      }

      video.src = url
    })
  }, [teamMode?.code])

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('video/')) {
        setErrorMsg('Please upload a video file.')
        return
      }
      // Generous sanity cap only. A 3-second clip off an iPhone Pro with
      // ProRes on runs ~90MB per SECOND, so short videos legitimately arrive
      // in the hundreds of MB — the old 200MB gate refused them outright even
      // though the analysis only ever uploads the compressed frames.
      if (file.size > 1024 * 1024 * 1024) {
        setErrorMsg('Video must be under 1GB. Try trimming the clip to just the shot.')
        return
      }

      setErrorMsg('')
      setNoShot(false)
      setStatus('extracting')
      setProgress(0)
      cancelledRef.current = false
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const rawFrames = await extractFrames(file)
        if (cancelledRef.current) return

        // Re-encode the frames if needed so the upload can never exceed
        // Vercel's 4.5MB request limit (the cause of the HTTP 413 error).
        const { frames, reduced } = await fitFramesToBudget(rawFrames)
        if (cancelledRef.current) return

        // The video was large enough to need compression — warn the user that
        // analysis quality will suffer and let them continue or re-record.
        if (reduced) {
          setStatus('quality-warning')
          const proceed = await new Promise<boolean>((resolve) => {
            confirmResolverRef.current = resolve
          })
          confirmResolverRef.current = null
          if (cancelledRef.current) return
          if (!proceed) {
            // User chose to re-record — nothing was uploaded or charged.
            setStatus('idle')
            setProgress(0)
            setPreviews([])
            if (inputRef.current) inputRef.current.value = ''
            return
          }
        }

        setStatus('uploading')
        setProgress(60)

        // Upload the original video directly to Vercel Blob (browser → Blob,
        // bypassing the serverless route's 4.5MB body limit). Skipped for very
        // large originals (iPhone ProRes etc.): the analysis only needs the
        // frames extracted above, and pushing hundreds of MB over cellular
        // stalls the flow for a file nobody needs stored — the results page
        // just shows the frames without the playable video. This threshold
        // must stay at or below /api/upload-video's maximumSizeInBytes.
        const BLOB_UPLOAD_MAX_BYTES = 100 * 1024 * 1024
        let videoUrl: string | null = null
        if (file.size <= BLOB_UPLOAD_MAX_BYTES) {
          setVideoUploadStatus({ state: 'uploading' })
          try {
            const ext = (file.name.split('.').pop() || 'mp4').toLowerCase()
            const pathname = `videos/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
            console.log('[VideoUploader] uploading video to Blob:', pathname, file.type, file.size)
            const blob = await upload(pathname, file, {
              access: 'public',
              handleUploadUrl: '/api/upload-video',
              clientPayload: JSON.stringify({ teamCode: teamMode?.code ?? null }),
              abortSignal: controller.signal,
            })
            videoUrl = blob.url
            console.log('[VideoUploader] video uploaded:', videoUrl)
            setVideoUploadStatus({ state: 'ok', url: blob.url })
          } catch (err) {
            // Non-fatal: continue without the video if blob upload fails.
            const errMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
            console.error('[VideoUploader] video blob upload failed:', err)
            setVideoUploadStatus({ state: 'failed', error: errMsg })
          }
        } else {
          console.log('[VideoUploader] original video too large to store, analyzing frames only:', file.size)
        }
        setProgress(75)
        if (cancelledRef.current) return

        const formData = new FormData()
        frames.forEach((blob, i) => formData.append('frames', blob, `frame-${i}.jpg`))
        if (videoUrl) formData.append('videoUrl', videoUrl)
        if (coachSelf) formData.append('coachSelf', 'true')

        if (teamMode) {
          formData.append('teamCode', teamMode.code)
          formData.append('playerFirstName', teamMode.firstName)
          formData.append('playerLastName', teamMode.lastName)
        }

        const res = await fetch('/api/analyze', { method: 'POST', body: formData, signal: controller.signal })
        setProgress(90)

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          if (errData.error === 'no_shot') {
            // No analyzable shot — not a failure, and nothing was charged.
            setNoShot(true)
            setStatus('idle')
            setProgress(0)
            setPreviews([])
            return
          }
          // Surface the server's real error detail, not just the generic label.
          throw new Error(errData.detail || errData.error || `Analysis failed (HTTP ${res.status})`)
        }

        const data = await res.json()
        setProgress(100)

        if (teamMode) {
          teamMode.onSuccess(data.submissionId)
        } else {
          router.push(`/results/${data.token}`)
        }
      } catch (err) {
        if (cancelledRef.current) return // user cancelled — state already reset
        console.error('[VideoUploader] upload failed:', err)
        setStatus('error')
        // Show the actual reason so a failed upload is diagnosable, not a mystery.
        const detail = err instanceof Error && err.message ? err.message : ''
        setErrorMsg(
          detail ? `Upload failed: ${detail}` : 'Something went wrong. Please try again.',
        )
      }
    },
    [extractFrames, router]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  // Cancel an in-progress analysis (e.g. wrong video) and return to the start.
  function cancelAnalysis() {
    cancelledRef.current = true
    abortRef.current?.abort()
    abortRef.current = null
    if (inputRef.current) inputRef.current.value = ''
    setStatus('idle')
    setProgress(0)
    setPreviews([])
    setVideoUploadStatus({ state: 'idle' })
    setErrorMsg('')
  }

  // Quality-warning prompt actions — resolve the promise handleFile awaits.
  function continueAnyway() {
    confirmResolverRef.current?.(true)
  }
  function cancelForRedo() {
    confirmResolverRef.current?.(false)
  }

  if (noShot) {
    return (
      <div className="w-full max-w-lg mx-auto text-center space-y-5 px-2">
        <div className="text-5xl">🚫</div>
        <div>
          <p className="text-black font-bold text-lg mb-2">
            We couldn&apos;t analyze a shot in this video
          </p>
          <p className="text-gray-600 text-sm leading-relaxed">
            The video wasn&apos;t analyzed and you were <strong>not charged</strong>. This happens
            when the camera is too far away, there&apos;s too much going on (like a full game
            clip), or no single shooter is clearly visible.
          </p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-left">
          <p className="text-sm font-bold text-black mb-1.5">For a video that can be analyzed:</p>
          <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
            <li>Show <strong>one person</strong> taking the shot</li>
            <li>Film <strong>from the front</strong> — head-on, or angled slightly toward the guide-hand side</li>
            <li>Fit the <strong>whole body in frame</strong> — head to feet, not just the top half</li>
            <li>Keep it to <strong>one shot</strong> — not a full game</li>
          </ul>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <a
            href="/support#filming"
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-black font-bold py-3 rounded-xl transition-colors flex items-center justify-center"
          >
            How to take a proper video
          </a>
          <button
            type="button"
            onClick={() => {
              setNoShot(false)
              if (inputRef.current) inputRef.current.value = ''
            }}
            className="flex-1 bg-ember-500 hover:bg-ember-400 text-ink-950 font-bold py-3 rounded-xl transition-colors"
          >
            Try another video
          </button>
        </div>
      </div>
    )
  }

  if (status === 'quality-warning') {
    return (
      <div className="w-full max-w-lg mx-auto text-center space-y-5 px-2">
        <div className="text-5xl">⚠️</div>
        <div>
          <p className="text-black font-bold text-lg mb-2">
            Heads up — this clip needed heavy compression
          </p>
          <p className="text-gray-600 text-sm leading-relaxed">
            Your video will still be analyzed, but we had to shrink the picture so much that
            the AI may miss details. A shorter, closer clip will grade more accurately.
          </p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-left">
          <p className="text-sm font-bold text-black mb-1.5">For the most accurate analysis:</p>
          <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
            <li>Record a <strong>short clip</strong> — just the shot, a few seconds long</li>
            <li>Film <strong>one shot at a time</strong></li>
            <li>Film <strong>from the front</strong> — head-on, or angled slightly toward the guide-hand side</li>
            <li>Fit the <strong>whole body in frame</strong> — head to feet, not just the top half</li>
          </ul>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={cancelForRedo}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-black font-bold py-3 rounded-xl transition-colors"
          >
            Cancel &amp; re-record
          </button>
          <button
            type="button"
            onClick={continueAnyway}
            className="flex-1 bg-ember-500 hover:bg-ember-400 text-ink-950 font-bold py-3 rounded-xl transition-colors"
          >
            Continue anyway
          </button>
        </div>
      </div>
    )
  }

  if (status === 'extracting' || status === 'uploading') {
    return (
      <div className="w-full max-w-lg mx-auto text-center space-y-6">
        <div className="text-5xl animate-bounce">🏀</div>
        <div>
          <p className="text-black font-semibold text-lg mb-2">
            {status === 'extracting'
              ? progress < 20 ? 'Scanning your video...'
              : progress < 45 ? 'Finding your shot...'
              : 'Capturing your shot...'
              : 'Uploading & analyzing your shot...'}
          </p>
          <p className="text-black text-sm">
            {status === 'extracting'
              ? progress < 20 ? 'Reading frames from your video'
              : progress < 45 ? 'AI is locating your shot release'
              : 'Extracting frames of your shooting form'
              : 'Our AI is studying your form in detail'}
          </p>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-orange-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-black text-xs">{progress}%</p>

        <button
          type="button"
          onClick={cancelAnalysis}
          className="text-sm font-semibold text-gray-400 hover:text-red-500 transition-colors"
        >
          Cancel
        </button>

        {videoUploadStatus.state !== 'idle' && (
          <div
            className={`text-xs rounded-lg px-3 py-2 border ${
              videoUploadStatus.state === 'ok'
                ? 'bg-green-50 border-green-200 text-green-800'
                : videoUploadStatus.state === 'failed'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-zinc-50 border-zinc-200 text-zinc-700'
            }`}
          >
            <div className="font-semibold mb-0.5">
              {videoUploadStatus.state === 'uploading' && 'Uploading video to storage...'}
              {videoUploadStatus.state === 'ok' && 'Video uploaded ✓'}
              {videoUploadStatus.state === 'failed' && 'Video upload failed (analysis will continue with frames only)'}
            </div>
            {videoUploadStatus.state === 'failed' && (
              <div className="font-mono text-[10px] text-red-700 break-all">
                {videoUploadStatus.error}
              </div>
            )}
          </div>
        )}

        {previews.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mt-4">
            {previews.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`Frame ${i + 1}`}
                className="rounded w-full aspect-video object-cover border border-gray-200"
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  const sessionLoading = !teamMode && !coachSelf && sessionUser === undefined
  const notLoggedIn = !teamMode && !coachSelf && sessionUser === null
  const noTokens = !teamMode && !coachSelf && !!sessionUser && !sessionUser.subscribed && sessionUser.tokens === 0 && !sessionUser.freeUpload
  const noCredits = !!coachSelf && (coachCredits ?? 0) === 0
  const isLocked = sessionLoading || notLoggedIn || noTokens || noCredits

  async function handleBuyToken() {
    trackInitiateCheckout()
    try {
      const res = await fetch('/api/buy-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const { url } = await res.json()
      if (url) window.location.href = url
    } catch {}
  }

  return (
    <div className="w-full max-w-lg mx-auto space-y-4 px-2">

      {/* Free first analysis for new accounts */}
      {sessionUser && !sessionUser.subscribed && sessionUser.tokens === 0 && sessionUser.freeUpload && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl px-4 py-2.5 text-center">
          <p className="text-orange-700 text-sm font-black tracking-wide">YOUR FIRST ANALYSIS IS FREE</p>
          <p className="text-orange-700/80 text-xs mt-0.5">
            You&apos;ll get your overall score — buy a token any time to unlock the full report.
          </p>
        </div>
      )}

      {/* Token count for logged-in users */}
      {sessionUser && !sessionUser.subscribed && sessionUser.tokens > 0 && (
        sessionUser.tokens === 1 ? (
          <div className="flex items-center justify-center gap-2 bg-orange-50 border border-orange-300 rounded-xl px-4 py-2">
            <span className="text-orange-700 text-sm font-black tracking-wide">1 ANALYSIS TOKEN REMAINING</span>
          </div>
        ) : (
          <p className="text-center text-gray-600 text-xs">{sessionUser.tokens} analysis tokens remaining</p>
        )
      )}

      {/* Drop zone */}
      <div className="relative">
        <div
          aria-hidden={isLocked || undefined}
          className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all duration-200
            ${isLocked
              ? 'border-gray-300 opacity-40 pointer-events-none select-none'
              : isDragging
                ? 'border-orange-500 bg-orange-500/5 cursor-pointer'
                : 'border-gray-300 hover:border-orange-400 hover:bg-orange-50/50 cursor-pointer'
            }`}
          onDragOver={(e) => { if (!isLocked) { e.preventDefault(); setIsDragging(true) } }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={isLocked ? undefined : onDrop}
          onClick={() => { if (!isLocked) inputRef.current?.click() }}
        >
          <div className="text-5xl mb-4">🎥</div>
          <p className="text-black font-semibold text-lg mb-1">Tap to upload your video</p>
          <p className="text-black text-sm hidden sm:block">or drag and drop</p>
          <p className="text-black text-xs mt-3">MP4, MOV, AVI · Max 1GB</p>
          <button className="mt-5 bg-ember-500 hover:bg-ember-400 text-ink-950 font-bold px-8 py-3 rounded-xl text-sm transition-colors w-full sm:w-auto">
            Choose Video
          </button>
        </div>

        {/* Not logged in overlay — semi-transparent wash signals the zone is locked */}
        {notLoggedIn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 bg-white/60 backdrop-blur-[1px] rounded-2xl">
            <div className="flex flex-col items-center gap-2.5 bg-white border border-gray-200 shadow-xl rounded-2xl px-5 py-4">
              <p className="text-black font-black text-base sm:text-lg text-center leading-snug">
                Sign up now for your free shot analysis
              </p>
              <p className="text-gray-500 text-xs text-center">
                New accounts get their first analysis free — upload your shot and see your score.
              </p>
              <div className="flex gap-2">
                <a
                  href="/signup"
                  className="bg-ember-500 hover:bg-ember-400 text-ink-950 font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
                >
                  Sign Up Free
                </a>
                <a
                  href="/login"
                  className="bg-gray-100 hover:bg-gray-200 text-black font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
                >
                  Log In
                </a>
              </div>
            </div>
          </div>
        )}

        {/* No tokens overlay */}
        {noTokens && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 bg-white/60 backdrop-blur-[1px] rounded-2xl">
            <div className="flex flex-col items-center gap-2.5 bg-white border border-gray-200 shadow-xl rounded-2xl px-5 py-4">
              <p className="text-black font-black text-base sm:text-lg text-center leading-snug">
                {inApp ? 'You need an analysis token to analyze your shot' : 'Buy a token to analyze your shot'}
              </p>
              {/* In the iOS app, token purchases go through native in-app purchase on the Analyze tab. */}
              {!inApp && (
                <button
                  onClick={handleBuyToken}
                  className="bg-ember-500 hover:bg-ember-400 text-ink-950 font-bold px-6 py-2.5 rounded-xl text-sm transition-colors"
                >
                  Buy Analysis — {usd(analysisUnitCents(!!sessionUser?.onInitiatedTeam))}
                </button>
              )}
              {sessionUser?.onTeam ? (
                <p className="text-gray-500 text-xs text-center">
                  Or ask your coach to send you tokens from your team.
                </p>
              ) : !inApp ? (
                <p className="text-gray-400 text-xs text-center">
                  Or{' '}
                  <a href="/shop" className="underline hover:text-gray-600">buy the training ball</a>
                  {' '}and get 5 free analyses
                </p>
              ) : null}
            </div>
          </div>
        )}

        {/* No coach credits overlay — semi-transparent wash signals the zone is locked */}
        {noCredits && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 bg-white/60 backdrop-blur-[1px] rounded-2xl">
            <div className="flex flex-col items-center gap-2 bg-white border-2 border-red-400 shadow-xl rounded-2xl px-5 py-4">
              <p className="text-red-600 font-black text-lg sm:text-xl text-center leading-snug">
                0 analysis credits remaining
              </p>
              <p className="text-gray-600 text-sm text-center">
                Buy a credit below before you can analyze your shot.
              </p>
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <p className="text-red-500 text-sm text-center">{errorMsg}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        aria-label="Upload a video of your shot"
        className="hidden"
        onChange={onInputChange}
      />
    </div>
  )
}
