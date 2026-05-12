'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { upload } from '@vercel/blob/client'

const FRAME_COUNT = 28
const ROUGH_COUNT = 10      // tiny frames for rough shot location
const PROBE_COUNT = 30      // low-res frames for precise release detection
const REGION_PAD = 0.40     // ±40% of video around rough center
const REGION_MIN_S = 5.0    // minimum dense region width — covers full short videos
const SEEK_TIMEOUT_MS = 4000  // max ms to wait for a seek before skipping

interface UploadCount { used: number; remaining: number | null; subscribed: boolean }

export default function VideoUploader() {
  const [isDragging, setIsDragging] = useState(false)
  const [status, setStatus] = useState<'idle' | 'extracting' | 'uploading' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [previews, setPreviews] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [videoUploadStatus, setVideoUploadStatus] = useState<
    { state: 'idle' } | { state: 'uploading' } | { state: 'ok'; url: string } | { state: 'failed'; error: string }
  >({ state: 'idle' })
  const [uploadCount, setUploadCount] = useState<UploadCount | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    try {
      const email = localStorage.getItem('fc_email')
      if (!email) return
      fetch(`/api/upload-count?email=${encodeURIComponent(email)}`)
        .then(r => r.json())
        .then((data: UploadCount) => setUploadCount(data))
        .catch(() => {})
    } catch {}
  }, [])

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
      video.currentTime = t
    })

  const extractFrames = useCallback(async (file: File): Promise<Blob[]> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'auto'
      video.muted = true
      const url = URL.createObjectURL(file)
      video.src = url

      video.onloadedmetadata = async () => {
        const duration = video.duration

        // --- Phase 1a: Extract tiny rough frames for shot location ---
        const roughCanvas = document.createElement('canvas')
        roughCanvas.width = 160
        roughCanvas.height = 90
        const roughCtx = roughCanvas.getContext('2d')!

        const roughTimestamps = Array.from({ length: ROUGH_COUNT }, (_, i) =>
          (duration / (ROUGH_COUNT + 1)) * (i + 1)
        )

        const roughBase64: string[] = []
        for (let i = 0; i < ROUGH_COUNT; i++) {
          await seekTo(video, roughTimestamps[i])
          roughCtx.drawImage(video, 0, 0, 160, 90)
          roughBase64.push(roughCanvas.toDataURL('image/jpeg', 0.6).split(',')[1])
          setProgress(Math.round(((i + 1) / ROUGH_COUNT) * 10))
        }

        // --- Phase 1b: Get rough shot region (which part of video has the shot) ---
        let roughCenter = 0.6
        try {
          const regionRes = await fetch('/api/detect-shot-region', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ frames: roughBase64 }),
          })
          if (regionRes.ok) {
            const { region } = await regionRes.json()
            roughCenter = Math.max(0, Math.min(100, region)) / 100
          }
        } catch {}

        setProgress(20)

        // --- Phase 1c: Extract dense probe frames around rough region ---
        const probeCanvas = document.createElement('canvas')
        probeCanvas.width = 320
        probeCanvas.height = 180
        const probeCtx = probeCanvas.getContext('2d')!

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
        for (let i = 0; i < PROBE_COUNT; i++) {
          await seekTo(video, probeTimestamps[i])
          probeCtx.drawImage(video, 0, 0, 320, 180)
          probeBase64.push(probeCanvas.toDataURL('image/jpeg', 0.7).split(',')[1])
          setProgress(Math.round(20 + ((i + 1) / PROBE_COUNT) * 15))
        }

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
            body: JSON.stringify({ frames: probeBase64 }),
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

        const timestamps = Array.from({ length: FRAME_COUNT }, (_, i) =>
          shotStart + ((shotEnd - shotStart) / (FRAME_COUNT + 1)) * (i + 1)
        )

        for (let i = 0; i < timestamps.length; i++) {
          await seekTo(video, timestamps[i])
          mainCanvas.width = video.videoWidth
          mainCanvas.height = video.videoHeight
          ctx.drawImage(video, 0, 0)
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
              0.85
            )
          })
        }

        setPreviews(thumbs)
        URL.revokeObjectURL(url)
        resolve(blobs)
      }

      video.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Failed to load video'))
      }
    })
  }, [])

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('video/')) {
        setErrorMsg('Please upload a video file.')
        return
      }
      if (file.size > 200 * 1024 * 1024) {
        setErrorMsg('Video must be under 200MB.')
        return
      }

      setErrorMsg('')
      setStatus('extracting')
      setProgress(0)

      try {
        const frames = await extractFrames(file)

        setStatus('uploading')
        setProgress(60)

        // Upload the original video directly to Vercel Blob (browser → Blob,
        // bypassing the serverless route's 4.5MB body limit).
        let videoUrl: string | null = null
        setVideoUploadStatus({ state: 'uploading' })
        try {
          const ext = (file.name.split('.').pop() || 'mp4').toLowerCase()
          const pathname = `videos/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
          console.log('[VideoUploader] uploading video to Blob:', pathname, file.type, file.size)
          const blob = await upload(pathname, file, {
            access: 'public',
            handleUploadUrl: '/api/upload-video',
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
        setProgress(75)

        const formData = new FormData()
        frames.forEach((blob, i) => formData.append('frames', blob, `frame-${i}.jpg`))
        if (videoUrl) formData.append('videoUrl', videoUrl)

        const res = await fetch('/api/analyze', { method: 'POST', body: formData })
        setProgress(90)

        if (!res.ok) throw new Error('Analysis failed')

        const data = await res.json()
        setProgress(100)

        router.push(`/gate/${data.submissionId}`)
      } catch (err) {
        console.error(err)
        setStatus('error')
        setErrorMsg('Something went wrong. Please try again.')
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

  const isLocked = uploadCount !== null && !uploadCount.subscribed && uploadCount.remaining === 0

  async function handleUpgrade() {
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'monthly' }),
      })
      const { url } = await res.json()
      if (url) window.location.href = url
    } catch {}
  }

  return (
    <div className="w-full max-w-lg mx-auto space-y-4 px-2">

      {/* Remaining upload countdown — only shown when we know the user's email */}
      {uploadCount && !uploadCount.subscribed && uploadCount.remaining !== null && uploadCount.remaining > 0 && (
        uploadCount.remaining === 1 ? (
          <div className="flex items-center justify-center gap-2 bg-orange-50 border border-orange-300 rounded-xl px-4 py-2">
            <span className="text-orange-500 text-sm font-black tracking-wide">1 UPLOAD REMAINING THIS MONTH</span>
          </div>
        ) : (
          <p className="text-center text-gray-400 text-xs">{uploadCount.remaining} uploads remaining this month</p>
        )
      )}

      {/* Drop zone — locked when out of uploads */}
      <div className="relative">
        <div
          className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all duration-200
            ${isLocked
              ? 'border-gray-200 opacity-40 pointer-events-none select-none'
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
          <p className="text-black text-xs mt-3">MP4, MOV, AVI · Max 200MB</p>
          <button className="mt-5 bg-orange-500 hover:bg-red-600 text-white font-bold px-8 py-3 rounded-xl text-sm transition-colors w-full sm:w-auto">
            Choose Video
          </button>
        </div>

        {/* Locked overlay */}
        {isLocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
            <p className="text-black font-bold text-base text-center leading-snug">
              Buy a Premium Plan to keep improving your shot
            </p>
            <button
              onClick={handleUpgrade}
              className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors"
            >
              Upgrade — from $2.49/mo
            </button>
            <p className="text-gray-400 text-xs">3 free analyses per month · Cancel anytime</p>
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
        className="hidden"
        onChange={onInputChange}
      />
    </div>
  )
}
