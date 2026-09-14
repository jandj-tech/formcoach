'use client'

import { trackInitiateCheckout } from '@/lib/meta-pixel'
import { useIsInApp } from '@/lib/useIsInApp'
import { analysisBaseCents, isOrgTier, usd } from '@/lib/team-pricing'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { upload } from '@vercel/blob/client'

import { extractFrames as extractFramesShared, fitFramesToBudget } from '@/lib/frame-extraction'


interface SessionUser { id: string; email: string; tokens: number; subscribed: boolean; onTeam: boolean; onInitiatedTeam: boolean; orgTier?: string; freeUpload: boolean }

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

  // On a successful analysis we navigate to /results without leaving this
  // component in 'idle' — so when the user backs out of the report, the
  // browser's back/forward cache restores this page frozen mid-upload (the
  // progress bar caught partway through its 90→100 transition, hence the
  // "stuck at ~97%" loading screen). The analysis actually finished; the UI is
  // just a stale snapshot. Any in-flight fetch is dead once a page is frozen,
  // so on restore it is always correct to snap the uploader back to idle.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return
      cancelledRef.current = true
      abortRef.current?.abort()
      abortRef.current = null
      setStatus('idle')
      setProgress(0)
      setPreviews([])
      setVideoUploadStatus({ state: 'idle' })
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  // Frame extraction lives in lib/frame-extraction.ts so the bulk uploader can
  // share it — and so both go through the same tab-wide decoder lock. Running
  // two extractions at once returns solid black frames with no error at all.
  const extractFrames = useCallback(
    (file: File) =>
      extractFramesShared(file, {
        teamCode: teamMode?.code ?? null,
        onProgress: setProgress,
        onStatus: (s) => setStatus(s as never),
        onPreviews: setPreviews,
        onNoShot: setNoShot,
        onError: setErrorMsg,
        isCancelled: () => cancelledRef.current,
      }),
    [teamMode?.code]
  )


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
            const clientPayload = JSON.stringify({ teamCode: teamMode?.code ?? null })

            if (process.env.NEXT_PUBLIC_STORAGE_DRIVER === 's3') {
              // Cloudflare R2: POST the file to our own route, which streams it
              // to the private R2 bucket server-side. No presigned URL and no
              // bucket CORS needed — the browser only ever talks to our origin.
              const contentType = file.type || 'application/octet-stream'
              console.log('[VideoUploader] uploading video to R2 via server:', pathname, contentType, file.size)
              const res = await fetch('/api/upload-video', {
                method: 'POST',
                headers: {
                  'Content-Type': contentType,
                  'x-upload-pathname': pathname,
                  'x-team-code': teamMode?.code ?? '',
                },
                body: file,
                signal: controller.signal,
              })
              if (!res.ok) {
                const { error } = await res.json().catch(() => ({ error: `Upload failed (${res.status})` }))
                throw new Error(error || `Upload failed (${res.status})`)
              }
              const { url } = (await res.json()) as { url: string }
              videoUrl = url
              console.log('[VideoUploader] video uploaded:', videoUrl)
              setVideoUploadStatus({ state: 'ok', url })
            } else {
              console.log('[VideoUploader] uploading video to Blob:', pathname, file.type, file.size)
              const blob = await upload(pathname, file, {
                access: 'public',
                handleUploadUrl: '/api/upload-video',
                clientPayload,
                abortSignal: controller.signal,
              })
              videoUrl = blob.url
              console.log('[VideoUploader] video uploaded:', videoUrl)
              setVideoUploadStatus({ state: 'ok', url: blob.url })
            }
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
        {/*
          Accessibility notes on this drop zone:

          - It used to carry aria-hidden={isLocked}, which removed the panel
            from the accessibility tree while leaving a focusable button inside
            it. A screen-reader user could tab onto a control that had been
            declared non-existent, and never hear WHY uploading was
            unavailable. `inert` is the right tool: it takes the subtree out of
            the tab order and the accessibility tree together.
          - The panel is presentational — the real control is the button inside
            it. Clicking the panel stays a pointer convenience and is
            deliberately NOT given button semantics, which would announce a
            duplicate control to screen readers.
          - The locked state was drawn with opacity-40, which dragged the
            guidance text to 2.84:1 on white. Explicit greys keep it legible
            while still reading as inactive.
        */}
        <div
          inert={isLocked || undefined}
          className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all duration-200
            ${isLocked
              ? 'border-gray-300 bg-gray-50 select-none'
              : isDragging
                ? 'border-orange-500 bg-orange-500/5 cursor-pointer'
                : 'border-gray-300 hover:border-orange-400 hover:bg-orange-50/50 cursor-pointer'
            }`}
          onDragOver={(e) => { if (!isLocked) { e.preventDefault(); setIsDragging(true) } }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={isLocked ? undefined : onDrop}
          onClick={() => { if (!isLocked) inputRef.current?.click() }}
        >
          <div className="text-5xl mb-4" aria-hidden="true">🎥</div>
          <p className={`font-semibold text-lg mb-1 ${isLocked ? 'text-gray-700' : 'text-black'}`}>
            Tap to upload your video
          </p>
          <p className={`text-sm hidden sm:block ${isLocked ? 'text-gray-700' : 'text-black'}`}>
            or drag and drop
          </p>
          <p className={`text-xs mt-3 ${isLocked ? 'text-gray-700' : 'text-black'}`}>
            MP4, MOV, AVI · Max 1GB
          </p>
          <button
            type="button"
            disabled={isLocked}
            className="mt-5 bg-ember-500 hover:bg-ember-400 text-ink-950 font-bold px-8 py-3 rounded-xl text-sm transition-colors w-full sm:w-auto disabled:bg-gray-200 disabled:text-gray-700"
          >
            Choose Video
          </button>
        </div>

        {/* Not logged in overlay — semi-transparent wash signals the zone is locked */}
        {notLoggedIn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 bg-white/60 backdrop-blur-[1px] rounded-2xl">
            <div className="flex flex-col items-center gap-2.5 bg-white border border-gray-200 shadow-xl rounded-2xl px-5 py-4">
              <p className="text-black font-black text-base sm:text-lg text-center leading-snug">
                Sign up now to analyze your shot
              </p>
              <p className="text-gray-500 text-xs text-center">
                Create an account, then upload your shot to see your score.
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
                  Buy Analysis — {usd(analysisBaseCents(isOrgTier(sessionUser?.orgTier) ? sessionUser.orgTier : 'none'))}
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
