'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const FRAME_COUNT = 28
const PROBE_COUNT = 30  // low-res frames to detect shot window
const SEEK_TIMEOUT_MS = 4000  // max ms to wait for a seek before skipping

export default function VideoUploader() {
  const [isDragging, setIsDragging] = useState(false)
  const [status, setStatus] = useState<'idle' | 'extracting' | 'uploading' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [previews, setPreviews] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const seekTo = (video: HTMLVideoElement, t: number): Promise<void> =>
    new Promise((res) => {
      let done = false
      const finish = () => { if (!done) { done = true; res() } }
      const timer = setTimeout(finish, SEEK_TIMEOUT_MS)
      video.onseeked = () => { clearTimeout(timer); finish() }
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

        // --- Phase 1: Extract low-res probe frames ---
        const probeCanvas = document.createElement('canvas')
        probeCanvas.width = 320
        probeCanvas.height = 180
        const probeCtx = probeCanvas.getContext('2d')!

        // Even distribution — release can happen anywhere in the video
        const probeTimestamps = Array.from({ length: PROBE_COUNT }, (_, i) =>
          (duration / (PROBE_COUNT + 1)) * (i + 1)
        )

        const probeBase64: string[] = []

        for (const t of probeTimestamps) {
          await seekTo(video, t)
          probeCtx.drawImage(video, 0, 0, 320, 180)
          probeBase64.push(probeCanvas.toDataURL('image/jpeg', 0.7).split(',')[1])
        }

        setProgress(20)

        // --- Phase 2: Find release frame, anchor window ±seconds around it ---
        // release - 1.7s covers: gather → shot pocket → jump → release
        // release + 0.8s covers: follow-through + ball in arc
        // Total: 2.5s — the complete jump shot
        // Fallback: 60% through the video (reasonable default if API fails)
        let releaseTime = duration * 0.6
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
        } catch {
          // Keep 60% fallback
        }

        setProgress(40)

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
                setProgress(Math.round(40 + ((i + 1) / timestamps.length) * 20))
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

        const formData = new FormData()
        frames.forEach((blob, i) => formData.append('frames', blob, `frame-${i}.jpg`))

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
              : progress < 40 ? 'Finding your shot...'
              : 'Capturing your shot...'
              : 'Uploading & analyzing your shot...'}
          </p>
          <p className="text-black text-sm">
            {status === 'extracting'
              ? progress < 20 ? 'Reading frames from your video'
              : progress < 40 ? 'AI is locating your shot release'
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

  return (
    <div className="w-full max-w-lg mx-auto space-y-4 px-2">
      <div
        className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200
          ${isDragging ? 'border-orange-500 bg-orange-500/5' : 'border-gray-300 hover:border-orange-400 hover:bg-orange-50/50'}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className="text-5xl mb-4">🎥</div>
        <p className="text-black font-semibold text-lg mb-1">Tap to upload your video</p>
        <p className="text-black text-sm hidden sm:block">or drag and drop</p>
        <p className="text-black text-xs mt-3">MP4, MOV, AVI · Max 200MB</p>
        <button className="mt-5 bg-orange-500 hover:bg-red-600 text-white font-bold px-8 py-3 rounded-xl text-sm transition-colors w-full sm:w-auto">
          Choose Video
        </button>
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
