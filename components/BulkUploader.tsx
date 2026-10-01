'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLinkIcon, RotateCwIcon, XIcon } from 'lucide-react'
import { extractFrames, fitFramesToBudget } from '@/lib/frame-extraction'
import { backendButton } from '@/components/backend/button-styles'
import type { TeamRosterEntry } from '@/lib/team-roster-refs'

/**
 * Upload a whole session's clips at once and get every grade back together.
 *
 * Two constraints shape everything here:
 *
 * 1. Frame extraction CANNOT run in parallel. It decodes video into a canvas,
 *    and a page gets a small shared pool of hardware decoders — two at once and
 *    drawImage() silently returns solid black, which uploads cleanly and comes
 *    back "no shot detected". lib/frame-extraction.ts holds a tab-wide lock, so
 *    lanes below can overlap freely and extraction still happens one at a time.
 *
 * 2. Grading is slow (roughly a minute a clip) but the server handles them
 *    concurrently, so the lanes overlap the waiting. The server allows 30
 *    analyses per 10 minutes per team; past that it answers 429 with
 *    Retry-After, and a lane waits that long and tries the same frames again
 *    instead of failing the row.
 *
 * Every clip is sent with a `playerRef` — a stable id for one roster row
 * (lib/team-roster-refs.ts) — never a name, so two "Liam S." can't collide.
 */

const MAX_CLIPS = 40
const LANES = 4
// 20 waits of up to 45s covers the full 10-minute window.
const MAX_RATE_WAITS = 20

export type RosterPlayer = TeamRosterEntry

type ClipState =
  | { kind: 'waiting' }
  | { kind: 'queued' }
  | { kind: 'frames'; pct: number }
  | { kind: 'grading' }
  | { kind: 'rate_wait'; seconds: number }
  | { kind: 'done'; token: string; score: number | null; filedUnder: string | null }
  | { kind: 'no_shot' }
  | { kind: 'error'; message: string }

interface Clip {
  id: string
  file: File
  playerRef: string | null
  /** Picked from the file name and not yet looked at by the coach. */
  autoMatched: boolean
  /** Why no player was picked automatically ("2 players named Liam S."). */
  matchNote: string | null
  /** Small poster frame (data URL) so IMG_4821.MOV still shows who it is. */
  thumb: string | null
  state: ClipState
}

/** "Liam_S-2.mov" -> ["liam", "s"] */
function nameTokens(fileName: string): string[] {
  return fileName
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

/**
 * Auto-assign only when exactly ONE roster row fits: first name plus last
 * initial when the file name has a second word ("liam_s"), else first name
 * alone and unique. Anything else stays unassigned for the coach to pick.
 */
function guessPlayer(
  fileName: string,
  roster: RosterPlayer[]
): { ref: string | null; note: string | null } {
  const tokens = nameTokens(fileName)
  const pickable = roster.filter((p) => !p.blockedReason)
  const firstNames = new Set(pickable.map((p) => p.firstName.toLowerCase()))
  const at = tokens.findIndex((t) => firstNames.has(t))
  if (at === -1) return { ref: null, note: null }
  const first = tokens[at]
  const next = tokens[at + 1]
  let hits = pickable.filter((p) => p.firstName.toLowerCase() === first)
  if (next) hits = hits.filter((p) => p.lastInitial.toLowerCase() === next[0])
  if (hits.length === 1) return { ref: hits[0].ref, note: null }
  if (hits.length === 0) {
    // "jayden_k" when the team only has a Jayden M.: say why nothing matched.
    const shown = `${first[0].toUpperCase()}${first.slice(1)}${next ? ` ${next[0].toUpperCase()}.` : ''}`
    return { ref: null, note: `No ${shown} on this team — pick a player` }
  }
  const shown = next ? hits[0].name : hits[0].firstName
  return { ref: null, note: `${hits.length} players named ${shown} — pick one` }
}

function optionLabel(p: RosterPlayer): string {
  return `${p.name} — ${p.detail}`
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** "5.25" -> "5.3/10" — one decimal everywhere a score shows. */
function formatScore(score: number): string {
  return `${Number(score).toFixed(1)}/10`
}

/**
 * One small JPEG from ~0.5s into the clip. Uses a throwaway <video> + canvas,
 * then drops the src so the decoder is released straight away. The caller
 * runs these one at a time and never alongside frame extraction (see
 * thumbInFlight) — a second concurrent decode is what turns frames black.
 */
function posterFrame(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    let settled = false
    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), 4000)
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.onerror = () => finish(null)
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2)
    }
    video.onseeked = () => {
      try {
        const w = 96
        const h = Math.max(1, Math.round((w * (video.videoHeight || 9)) / (video.videoWidth || 16)))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')?.drawImage(video, 0, 0, w, h)
        finish(canvas.toDataURL('image/jpeg', 0.6))
      } catch {
        finish(null)
      }
    }
    video.src = url
  })
}

interface NextStepLink {
  href: string
  label: string
}

export default function BulkUploader({
  teamCode,
  roster,
  credits,
  creditsSource = 'Your tokens are used first, then the team’s',
  links,
}: {
  teamCode: string
  roster: RosterPlayer[]
  /**
   * What /api/analyze will actually draw on for this login (teamUploadBalance):
   * a coach's own tokens + the team's, or the team's + the organization's.
   */
  credits: number
  /** Where those tokens come from, in spending order — teamUploadCopy().source. */
  creditsSource?: string
  links?: { emailResults: NextStepLink; getCredits: NextStepLink }
}) {
  const [clips, setClips] = useState<Clip[]>([])
  const [reviewing, setReviewing] = useState(false)
  const [activeLanes, setActiveLanes] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [tooMany, setTooMany] = useState(false)
  // Desktop-only, and unknown until the browser has told us — rendering the
  // uploader first and swapping it for the phone notice is a visible flash and
  // briefly offers a control that will not work.
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const cancelled = useRef(false)
  const queue = useRef<string[]>([])
  const lanes = useRef(0)
  const clipsRef = useRef<Clip[]>([])
  const thumbQueue = useRef<Array<{ id: string; file: File }>>([])
  const thumbWorker = useRef(false)
  /** The poster frame being decoded right now; extraction waits for it. */
  const thumbInFlight = useRef<Promise<unknown> | null>(null)

  useEffect(() => {
    clipsRef.current = clips
  }, [clips])

  const byRef = useMemo(() => new Map(roster.map((p) => [p.ref, p])), [roster])

  useEffect(() => {
    const check = () =>
      setIsDesktop(window.matchMedia('(min-width: 900px) and (pointer: fine)').matches)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Reset on mount too: React's dev double-mount runs the cleanup once, and a
  // `cancelled` stuck at true would silently stop thumbnails and lanes.
  useEffect(() => {
    cancelled.current = false
    return () => {
      cancelled.current = true
    }
  }, [])

  const running = activeLanes > 0

  // Leaving the page cancels every clip still queued; say so first.
  useEffect(() => {
    if (!running) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [running])

  const setClip = useCallback((id: string, patch: Partial<Clip>) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }, [])

  /**
   * Poster frames, one at a time, only while no lane is grading — so they can
   * never overlap frame extraction's decoder. A clip added mid-run gets its
   * thumbnail once the run finishes.
   */
  const runThumbs = useCallback(async () => {
    if (thumbWorker.current) return
    thumbWorker.current = true
    try {
      while (thumbQueue.current.length > 0 && !cancelled.current) {
        if (lanes.current > 0) {
          await sleep(500)
          continue
        }
        const job = thumbQueue.current.shift()!
        const p = posterFrame(job.file)
        thumbInFlight.current = p
        const thumb = await p
        thumbInFlight.current = null
        if (thumb) setClip(job.id, { thumb })
      }
    } finally {
      thumbWorker.current = false
    }
  }, [setClip])

  const addFiles = useCallback(
    (files: File[]) => {
      const videos = files.filter((f) => f.type.startsWith('video/'))
      // Room is read from `clips`, not from inside the setClips updater: React
      // may run an updater more than once, and setting other state from in
      // there would fire the overflow notice twice.
      const room = Math.max(0, MAX_CLIPS - clips.length)
      setTooMany(videos.length > room)
      if (room === 0) return
      const added: Clip[] = videos.slice(0, room).map((file) => {
        const guess = guessPlayer(file.name, roster)
        return {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          playerRef: guess.ref,
          autoMatched: !!guess.ref,
          matchNote: guess.note,
          thumb: null,
          state: { kind: 'waiting' } as ClipState,
        }
      })
      setClips((prev) => [...prev, ...added])
      thumbQueue.current.push(...added.map((c) => ({ id: c.id, file: c.file })))
      void runThumbs()
    },
    [clips.length, roster, runThumbs]
  )

  const ready = clips.filter((c) => c.playerRef && c.state.kind === 'waiting')
  const unassigned = clips.filter((c) => !c.playerRef && c.state.kind === 'waiting').length
  const inFlight = clips.filter((c) =>
    ['queued', 'frames', 'grading', 'rate_wait'].includes(c.state.kind)
  ).length
  const graded = clips.filter((c) => c.state.kind === 'done')
  const finishedCount = clips.filter((c) => c.state.kind === 'done' || c.state.kind === 'no_shot').length
  const noShotCount = clips.filter((c) => c.state.kind === 'no_shot').length
  const failed = clips.filter((c) => c.state.kind === 'error')
  const ended = finishedCount + failed.length
  // Each graded clip was charged; the rest of the balance is what is left.
  const creditsLeft = Math.max(0, credits - graded.length)
  const notEnoughCredits = ready.length + inFlight > creditsLeft

  /** One clip, start to finish. Extraction self-serializes inside the library. */
  const processClip = useCallback(
    async (clipId: string) => {
      const clip = clipsRef.current.find((c) => c.id === clipId)
      if (!clip?.playerRef) return
      try {
        // Never decode alongside a poster frame (see runThumbs).
        if (thumbInFlight.current) await thumbInFlight.current.catch(() => undefined)
        setClip(clip.id, { state: { kind: 'frames', pct: 0 } })
        const raw = await extractFrames(clip.file, {
          teamCode,
          onProgress: (pct) =>
            setClip(clip.id, { state: { kind: 'frames', pct: Math.min(100, pct) } }),
          isCancelled: () => cancelled.current,
        })
        if (cancelled.current) return
        if (raw.length === 0) {
          setClip(clip.id, { state: { kind: 'error', message: 'No frames could be read from this video' } })
          return
        }

        const { frames } = await fitFramesToBudget(raw)

        for (let attempt = 0; ; attempt++) {
          setClip(clip.id, { state: { kind: 'grading' } })
          const form = new FormData()
          frames.forEach((b, i) => form.append('frames', b, `frame-${i}.jpg`))
          form.append('teamCode', teamCode)
          form.append('playerRef', clip.playerRef)

          const res = await fetch('/api/analyze', { method: 'POST', body: form })
          if (res.status === 429 && attempt < MAX_RATE_WAITS) {
            // Rate limited, not failed: wait, then send the same frames again.
            // lib/rate-limit.ts always answers Retry-After = the whole window
            // (600s) even when the oldest hit expires sooner, so poll at most
            // every 45s instead — a refused request records no hit, so asking
            // again costs nothing.
            const wait = Math.min(45, Math.max(5, Number(res.headers.get('Retry-After')) || 30))
            for (let left = wait; left > 0; left--) {
              if (cancelled.current) return
              setClip(clip.id, { state: { kind: 'rate_wait', seconds: left } })
              await sleep(1000)
            }
            continue
          }
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            if (err.error === 'no_shot') {
              // Not a failure and not charged — the clip simply had no shot in it.
              setClip(clip.id, { state: { kind: 'no_shot' } })
              return
            }
            if (res.status === 402) throw new Error('Out of tokens — add more, then try again')
            throw new Error(err.detail || err.error || `Grading failed (${res.status})`)
          }
          const data = await res.json()
          setClip(clip.id, {
            state: {
              kind: 'done',
              token: data.token,
              score: data.overallScore ?? null,
              filedUnder: data.filedUnder ?? null,
            },
          })
          return
        }
      } catch (err) {
        if (cancelled.current) return
        setClip(clip.id, {
          state: {
            kind: 'error',
            // fetch() rejects with a TypeError ("Failed to fetch", "Load
            // failed") when the connection drops — say that in plain words.
            message: err instanceof TypeError && /fetch|load failed|network/i.test(err.message)
              ? 'Connection lost — try again'
              : err instanceof Error ? err.message : 'Something went wrong',
          },
        })
      }
    },
    [teamCode, setClip]
  )

  /**
   * Fixed lanes pulling from a shared queue, rather than fixed-size chunks: a
   * chunk finishes at the speed of its slowest clip and leaves lanes idle. The
   * queue is a ref so "Try again" and a second batch can join a running one.
   */
  const pump = useCallback(() => {
    const lane = async () => {
      try {
        while (!cancelled.current) {
          const id = queue.current.shift()
          if (!id) return
          await processClip(id)
        }
      } finally {
        lanes.current -= 1
        setActiveLanes(lanes.current)
      }
    }
    // Running lanes are always busy (a lane exits once the queue is empty),
    // so each queued clip beyond them can take a new lane, up to LANES.
    const toStart = Math.min(LANES - lanes.current, queue.current.length)
    for (let i = 0; i < toStart; i++) {
      lanes.current += 1
      void lane()
    }
    setActiveLanes(lanes.current)
  }, [processClip])

  const enqueue = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
      cancelled.current = false
      setClips((prev) =>
        prev.map((c) => (ids.includes(c.id) ? { ...c, state: { kind: 'queued' } } : c))
      )
      queue.current.push(...ids)
      // Let the queued state land before a lane reads the clip.
      setTimeout(pump, 0)
    },
    [pump]
  )

  const startGrading = () => {
    setReviewing(false)
    enqueue(ready.map((c) => c.id))
  }

  const statusText = (c: Clip): string => {
    switch (c.state.kind) {
      case 'waiting':
        return c.playerRef ? 'Assigned' : (c.matchNote ?? 'Pick a player')
      case 'queued':
        return 'Waiting its turn…'
      case 'frames':
        return `Looking at the video… ${c.state.pct}%`
      case 'grading':
        return 'Grading the shot…'
      case 'rate_wait':
        return `Waiting a moment… (${c.state.seconds}s)`
      case 'done': {
        const who = c.state.filedUnder ?? (c.playerRef ? byRef.get(c.playerRef)?.name : null)
        const score = c.state.score !== null ? `Score ${formatScore(c.state.score)}` : 'Done'
        return who ? `${score} — ${who}` : score
      }
      case 'no_shot':
        return 'No shot found in this clip (not charged)'
      case 'error':
        return c.state.message
    }
  }

  // Review summary: who gets which files.
  const reviewGroups = useMemo(() => {
    const groups = new Map<string, Clip[]>()
    for (const c of ready) groups.set(c.playerRef!, [...(groups.get(c.playerRef!) ?? []), c])
    return [...groups.entries()].map(([ref, list]) => ({ player: byRef.get(ref), ref, list }))
  }, [ready, byRef])

  if (isDesktop === null) return <div className="h-40" aria-hidden />

  if (!isDesktop) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-gray-300 dark:border-courtline bg-gray-50 dark:bg-ink-800 p-8 text-center">
        <p className="text-lg font-bold text-gray-900 dark:text-chalk">Use a computer for this one</p>
        <p className="mt-2 text-sm text-gray-600 dark:text-chalk-dim">
          Uploading a whole session at once needs a laptop or desktop. On your phone you can still
          upload clips one at a time.
        </p>
      </div>
    )
  }

  const canEditPlayer = (c: Clip) => !reviewing && (c.state.kind === 'waiting' || c.state.kind === 'error')

  return (
    <div className="w-full space-y-4">
      <div className="rounded-2xl border border-gray-200 dark:border-courtline p-5">
        <h1 className="text-xl font-bold text-gray-900 dark:text-chalk">Upload a whole session</h1>
        <ol className="mt-3 space-y-1 text-sm text-gray-600 dark:text-chalk-dim">
          <li>
            <span className="font-bold text-ember-600 dark:text-ember-400">1.</span> Drop in up to {MAX_CLIPS} videos —
            one shot per video.
          </li>
          <li>
            <span className="font-bold text-ember-600 dark:text-ember-400">2.</span> Say who is in each one. Check any
            row marked &ldquo;Matched from file name&rdquo;.
          </li>
          <li>
            <span className="font-bold text-ember-600 dark:text-ember-400">3.</span> Press Start, check the summary,
            then leave this tab open. Every grade lands here together.
          </li>
        </ol>
        <p className="mt-3 text-sm text-gray-700 dark:text-chalk">
          <span className="font-bold">{creditsLeft} token{creditsLeft === 1 ? '' : 's'} left</span>. {creditsSource}.
          One token per graded video; clips with no shot in them are free.
        </p>
      </div>

      <div
        className={`rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
          reviewing
            ? 'border-gray-300 dark:border-courtline bg-gray-50 dark:bg-ink-800'
            : isDragging
              ? 'border-ember-500 bg-ember-500/10'
              : 'border-gray-300 dark:border-courtline hover:border-ember-400 hover:bg-ember-500/5'
        }`}
        onDragOver={(e) => {
          if (reviewing) return
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          if (reviewing) return
          e.preventDefault()
          setIsDragging(false)
          addFiles(Array.from(e.dataTransfer.files))
        }}
      >
        <p className="text-lg font-bold text-gray-900 dark:text-chalk">Drag your videos here</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-chalk-dim">
          {clips.length > 0
            ? `${clips.length} of ${MAX_CLIPS} added`
            : `Up to ${MAX_CLIPS} at a time`}
        </p>
        <button
          type="button"
          disabled={reviewing || clips.length >= MAX_CLIPS}
          onClick={() => fileInput.current?.click()}
          className={backendButton('primary', 'mt-4')}
        >
          Choose videos
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
      </div>

      {tooMany && (
        <p className="text-sm text-ember-700 dark:text-ember-400">
          Only the first {MAX_CLIPS} fit. Press &ldquo;Clear finished&rdquo; after a run to make room for the rest.
        </p>
      )}

      {clips.length > 0 && !reviewing && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-courtline">
          {clips.map((c) => {
            const picked = c.playerRef ? byRef.get(c.playerRef) : undefined
            return (
              <div
                key={c.id}
                className="flex items-center gap-3 border-b border-gray-100 dark:border-courtline px-4 py-3 last:border-b-0"
              >
                <div className="flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-gray-100 dark:bg-ink-800">
                  {c.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local data URL, nothing to optimize
                    <img src={c.thumb} alt={`First frame of ${c.file.name}`} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <span className="w-40 shrink-0 truncate text-sm text-gray-700 dark:text-chalk-dim" title={c.file.name}>
                  {c.file.name}
                </span>

                <div className="w-80 shrink-0">
                  <select
                    value={c.playerRef ?? ''}
                    disabled={!canEditPlayer(c)}
                    onFocus={() => c.autoMatched && setClip(c.id, { autoMatched: false })}
                    onChange={(e) =>
                      setClip(c.id, { playerRef: e.target.value || null, autoMatched: false, matchNote: null })
                    }
                    aria-label={`Player in ${c.file.name}`}
                    title={picked ? optionLabel(picked) : undefined}
                    className="w-full rounded-lg border border-gray-300 dark:border-courtline dark:bg-ink-800 dark:text-chalk px-2 py-1.5 text-sm disabled:opacity-60"
                  >
                    <option value="">Who is this?</option>
                    {roster.map((p) => (
                      <option key={p.ref} value={p.ref} disabled={!!p.blockedReason}>
                        {optionLabel(p)}
                        {p.blockedReason ? ` (${p.blockedReason})` : ''}
                      </option>
                    ))}
                  </select>
                  {(c.autoMatched || picked?.sameNameAsAnother) && c.state.kind === 'waiting' && (
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      {c.autoMatched && (
                        <span className="rounded bg-ember-500/15 px-1.5 py-0.5 font-bold text-ember-700 dark:text-ember-400">
                          Matched from file name — check
                        </span>
                      )}
                      {picked?.sameNameAsAnother && (
                        <span className="rounded bg-gray-100 dark:bg-ink-800 px-1.5 py-0.5 text-gray-700 dark:text-chalk-dim">
                          Same name as another player — check
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  {c.state.kind === 'frames' && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-ink-800">
                      <div
                        className="h-full rounded-full bg-ember-500 transition-all"
                        style={{ width: `${c.state.pct}%` }}
                      />
                    </div>
                  )}
                  <span
                    className={`block truncate text-sm ${
                      c.state.kind === 'done'
                        ? 'font-semibold text-green-700 dark:text-green-400'
                        : c.state.kind === 'error'
                          ? 'text-red-700 dark:text-red-400'
                          : c.state.kind === 'no_shot' || (c.state.kind === 'waiting' && c.matchNote)
                            ? 'text-ember-700 dark:text-ember-400'
                            : 'text-gray-500 dark:text-chalk-dim'
                    }`}
                    title={statusText(c)}
                  >
                    {statusText(c)}
                  </span>
                </div>

                {c.state.kind === 'done' && (
                  <a
                    href={`/team/dashboard/shot/${c.state.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-ember-600 dark:text-ember-400 hover:underline"
                  >
                    See it
                    <ExternalLinkIcon className="h-3.5 w-3.5" aria-hidden />
                  </a>
                )}
                {c.state.kind === 'error' && (
                  <button
                    type="button"
                    disabled={!c.playerRef || notEnoughCredits}
                    onClick={() => enqueue([c.id])}
                    className={backendButton('secondary', 'shrink-0')}
                  >
                    <RotateCwIcon aria-hidden />
                    Try again
                  </button>
                )}
                {(c.state.kind === 'waiting' || c.state.kind === 'error' || c.state.kind === 'no_shot') && (
                  <button
                    type="button"
                    onClick={() => setClips((prev) => prev.filter((x) => x.id !== c.id))}
                    aria-label={`Remove ${c.file.name}`}
                    className="shrink-0 p-1 text-gray-400 dark:text-chalk-dim hover:text-red-600"
                  >
                    <XIcon className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {reviewing && (
        <div className="rounded-2xl border border-ember-500/40 bg-ember-500/5 p-5 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-chalk">
              {ready.length} video{ready.length === 1 ? '' : 's'} → {reviewGroups.length} player
              {reviewGroups.length === 1 ? '' : 's'}
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-chalk-dim">
              Check each name before grading. Uses {ready.length} of the {creditsLeft} token{creditsLeft === 1 ? '' : 's'} left. {creditsSource}.
            </p>
          </div>
          <ul className="divide-y divide-gray-200 dark:divide-courtline rounded-xl border border-gray-200 dark:border-courtline bg-white dark:bg-ink-900">
            {reviewGroups.map(({ player, ref, list }) => (
              <li key={ref} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-bold text-gray-900 dark:text-chalk">{player?.name ?? 'Unknown player'}</span>
                  <span className="text-xs text-gray-500 dark:text-chalk-dim">{player?.detail}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                  {list.length > 1 && (
                    <span className="rounded bg-ember-500/15 px-1.5 py-0.5 font-bold text-ember-700 dark:text-ember-400">
                      Gets {list.length} videos
                    </span>
                  )}
                  {list.some((c) => c.autoMatched) && (
                    <span className="rounded bg-ember-500/15 px-1.5 py-0.5 font-bold text-ember-700 dark:text-ember-400">
                      Matched from file name
                    </span>
                  )}
                  {player?.sameNameAsAnother && (
                    <span className="rounded bg-gray-100 dark:bg-ink-800 px-1.5 py-0.5 text-gray-700 dark:text-chalk-dim">
                      Same name as another player
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {list.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-courtline px-1.5 py-1 text-sm text-gray-600 dark:text-chalk-dim"
                    >
                      {c.thumb && (
                        // eslint-disable-next-line @next/next/no-img-element -- local data URL
                        <img src={c.thumb} alt="" className="h-6 w-10 rounded object-cover" />
                      )}
                      {c.file.name}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          {unassigned > 0 && (
            <p className="text-sm text-ember-700 dark:text-ember-400">
              {unassigned} video{unassigned === 1 ? '' : 's'} without a player will be skipped.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={startGrading}
              disabled={notEnoughCredits}
              className={backendButton('primary', 'px-7 py-3 text-base')}
            >
              Looks right — start grading
            </button>
            <button type="button" onClick={() => setReviewing(false)} className={backendButton('secondary', 'px-5 py-3')}>
              Go back
            </button>
          </div>
        </div>
      )}

      {clips.length > 0 && !reviewing && (
        <div className="flex flex-wrap items-center gap-3">
          {/* Hidden once nothing is left to start — a disabled "Start 0
              videos" after a run reads like something is still wrong. */}
          {(ready.length > 0 || unassigned > 0) && (
            <button
              type="button"
              disabled={ready.length === 0 || notEnoughCredits}
              onClick={() => setReviewing(true)}
              className={backendButton('primary', 'px-7 py-3 text-base')}
            >
              {`Start ${ready.length} video${ready.length === 1 ? '' : 's'}`}
            </button>
          )}

          {running && (
            <span className="text-sm text-gray-700 dark:text-chalk">
              Grading… {finishedCount} done, {inFlight} to go. Keep this tab open — closing it stops the ones
              still waiting.
            </span>
          )}
          {unassigned > 0 && (
            <span className="text-sm text-ember-700 dark:text-ember-400">
              {unassigned} still {unassigned === 1 ? 'needs' : 'need'} a player.
            </span>
          )}
          {notEnoughCredits && (
            <span className="text-sm text-red-700 dark:text-red-400">
              That is {ready.length + inFlight} video{ready.length + inFlight === 1 ? '' : 's'} but only{' '}
              {creditsLeft} token{creditsLeft === 1 ? '' : 's'} left. Remove some, or{' '}
              <a href={links?.getCredits.href ?? '/team/dashboard#credits'} className="font-bold underline">
                {(links?.getCredits.label ?? 'get more tokens').replace(/^./, (ch) => ch.toLowerCase())}
              </a>
              .
            </span>
          )}
        </div>
      )}

      {!reviewing && !running && inFlight === 0 && ended > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-courtline p-5 space-y-3">
          <p className="text-base font-bold text-gray-900 dark:text-chalk">
            {[
              `${graded.length} graded`,
              noShotCount > 0 ? `${noShotCount} no shot found` : null,
              failed.length > 0 ? `${failed.length} failed` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {noShotCount > 0 && (
            <p className="text-sm text-gray-600 dark:text-chalk-dim">
              Clips with no shot found were not charged.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {failed.length > 0 && (
              <button
                type="button"
                disabled={notEnoughCredits || failed.some((c) => !c.playerRef)}
                onClick={() => enqueue(failed.map((c) => c.id))}
                className={backendButton('primary')}
              >
                <RotateCwIcon aria-hidden />
                Try {failed.length === 1 ? 'it' : `all ${failed.length}`} again
              </button>
            )}
            {graded.length > 0 && (
              <a href={links?.emailResults.href ?? '/team/dashboard'} className={backendButton(failed.length > 0 ? 'secondary' : 'primary')}>
                {links?.emailResults.label ?? 'Send the results from your dashboard'}
              </a>
            )}
            {graded.length > 0 && (
              <a href="/team/dashboard" className={backendButton('secondary')}>
                See all {graded.length} on the dashboard
              </a>
            )}
            {finishedCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setClips((prev) => prev.filter((c) => c.state.kind !== 'done' && c.state.kind !== 'no_shot'))
                  setTooMany(false)
                }}
                className={backendButton('quiet')}
              >
                Clear finished
              </button>
            )}
          </div>
          <p className="text-sm text-gray-600 dark:text-chalk-dim">
            Want to add more? Drop more videos in above.
          </p>
        </div>
      )}
    </div>
  )
}
