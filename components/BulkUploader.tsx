'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { extractFrames, fitFramesToBudget } from '@/lib/frame-extraction'
import { backendButton } from '@/components/backend/button-styles'

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
 *    concurrently, so the lanes overlap the waiting. Four lanes keeps twelve
 *    clips inside the 30-requests-per-600s rate limit with a retry round spare.
 */

const MAX_CLIPS = 12
const LANES = 4

export interface RosterPlayer {
  id: string
  first_name: string
  last_name_initial: string
}

type ClipState =
  | { kind: 'waiting' }
  | { kind: 'frames'; pct: number }
  | { kind: 'grading' }
  | { kind: 'done'; token: string; score: number | null }
  | { kind: 'no_shot' }
  | { kind: 'error'; message: string }

interface Clip {
  id: string
  file: File
  playerId: string | null
  state: ClipState
}

/** "jayden_2.mov" -> "jayden", so a sensibly named file picks its own player. */
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z]+/g, ' ').trim()
}

function guessPlayer(file: File, roster: RosterPlayer[]): string | null {
  const name = normalizeName(file.name)
  if (!name) return null
  const hit = roster.find((p) => {
    const first = p.first_name.toLowerCase()
    return name === first || name.startsWith(first + ' ') || name.split(' ').includes(first)
  })
  return hit?.id ?? null
}

export default function BulkUploader({
  teamCode,
  roster,
  credits,
}: {
  teamCode: string
  roster: RosterPlayer[]
  credits: number
}) {
  const [clips, setClips] = useState<Clip[]>([])
  const [running, setRunning] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [tooMany, setTooMany] = useState(false)
  // Desktop-only, and unknown until the browser has told us — rendering the
  // uploader first and swapping it for the phone notice is a visible flash and
  // briefly offers a control that will not work.
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const cancelled = useRef(false)

  useEffect(() => {
    const check = () =>
      setIsDesktop(window.matchMedia('(min-width: 900px) and (pointer: fine)').matches)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => () => { cancelled.current = true }, [])

  const setClip = useCallback((id: string, patch: Partial<Clip>) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }, [])

  const addFiles = useCallback(
    (files: File[]) => {
      const videos = files.filter((f) => f.type.startsWith('video/'))
      // Room is read from `clips`, not from inside the setClips updater: React
      // may run an updater more than once, and setting other state from in
      // there would fire the overflow notice twice.
      const room = Math.max(0, MAX_CLIPS - clips.length)
      setTooMany(videos.length > room)
      if (room === 0) return
      setClips((prev) => [
        ...prev,
        ...videos.slice(0, room).map((file) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          playerId: guessPlayer(file, roster),
          state: { kind: 'waiting' } as ClipState,
        })),
      ])
    },
    [clips.length, roster]
  )

  const readyCount = clips.filter((c) => c.playerId && c.state.kind === 'waiting').length
  const unassigned = clips.filter((c) => !c.playerId).length
  const finished = clips.filter(
    (c) => c.state.kind === 'done' || c.state.kind === 'no_shot' || c.state.kind === 'error'
  ).length
  const graded = clips.filter((c) => c.state.kind === 'done')
  const notEnoughCredits = readyCount > credits

  /** One clip, start to finish. Extraction self-serializes inside the library. */
  const processClip = useCallback(
    async (clip: Clip) => {
      const player = roster.find((p) => p.id === clip.playerId)
      if (!player) return
      try {
        setClip(clip.id, { state: { kind: 'frames', pct: 0 } })
        const raw = await extractFrames(clip.file, {
          teamCode,
          onProgress: (pct) =>
            setClip(clip.id, { state: { kind: 'frames', pct: Math.min(100, pct) } }),
          isCancelled: () => cancelled.current,
        })
        if (cancelled.current) return
        if (raw.length === 0) {
          setClip(clip.id, { state: { kind: 'error', message: 'No frames could be read' } })
          return
        }

        const { frames } = await fitFramesToBudget(raw)
        setClip(clip.id, { state: { kind: 'grading' } })

        const form = new FormData()
        frames.forEach((b, i) => form.append('frames', b, `frame-${i}.jpg`))
        form.append('teamCode', teamCode)
        form.append('playerFirstName', player.first_name)
        form.append('playerLastName', player.last_name_initial)

        const res = await fetch('/api/analyze', { method: 'POST', body: form })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          if (err.error === 'no_shot') {
            // Not a failure and not charged — the clip simply had no shot in it.
            setClip(clip.id, { state: { kind: 'no_shot' } })
            return
          }
          throw new Error(err.detail || err.error || `Grading failed (${res.status})`)
        }
        const data = await res.json()
        setClip(clip.id, {
          state: { kind: 'done', token: data.token, score: data.overallScore ?? null },
        })
      } catch (err) {
        if (cancelled.current) return
        setClip(clip.id, {
          state: {
            kind: 'error',
            message: err instanceof Error ? err.message : 'Something went wrong',
          },
        })
      }
    },
    [roster, teamCode, setClip]
  )

  const start = useCallback(async () => {
    cancelled.current = false
    setRunning(true)
    const queue = clips.filter((c) => c.playerId && c.state.kind === 'waiting')
    let next = 0
    // Fixed lanes pulling from a shared cursor, rather than fixed-size chunks:
    // a chunk finishes at the speed of its slowest clip and leaves lanes idle.
    const lane = async () => {
      while (!cancelled.current) {
        const i = next++
        if (i >= queue.length) return
        await processClip(queue[i])
      }
    }
    await Promise.all(Array.from({ length: Math.min(LANES, queue.length) }, lane))
    setRunning(false)
  }, [clips, processClip])

  const label = useMemo(
    () => (c: Clip) => {
      switch (c.state.kind) {
        case 'waiting':
          return c.playerId ? 'Ready' : 'Pick a player'
        case 'frames':
          return `Looking at the video… ${c.state.pct}%`
        case 'grading':
          return 'Grading the shot…'
        case 'done':
          return c.state.score !== null ? `Score ${c.state.score}/10` : 'Done'
        case 'no_shot':
          return 'No shot found in this clip'
        case 'error':
          return c.state.message
      }
    },
    []
  )

  if (isDesktop === null) return <div className="h-40" aria-hidden />

  if (!isDesktop) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-gray-300 dark:border-courtline bg-gray-50 dark:bg-ink-800 p-8 text-center">
        <p className="text-lg font-black text-gray-900 dark:text-chalk">Use a computer for this one</p>
        <p className="mt-2 text-sm text-gray-600 dark:text-chalk-dim">
          Uploading a whole session at once needs a laptop or desktop. On your phone you can still
          upload clips one at a time.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-4">
      <div className="rounded-2xl border border-gray-200 dark:border-courtline p-5">
        <h2 className="text-xl font-black text-gray-900 dark:text-chalk">Upload a whole session</h2>
        <ol className="mt-3 space-y-1 text-sm text-gray-600 dark:text-chalk-dim">
          <li>
            <span className="font-bold text-ember-600 dark:text-ember-400">1.</span> Drop in up to {MAX_CLIPS} videos —
            one shot per video.
          </li>
          <li>
            <span className="font-bold text-ember-600 dark:text-ember-400">2.</span> Say who is in each one.
          </li>
          <li>
            <span className="font-bold text-ember-600 dark:text-ember-400">3.</span> Press Start, then leave this tab
            open. Every grade lands here together.
          </li>
        </ol>
      </div>

      <div
        className={`rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
          running
            ? 'border-gray-300 dark:border-courtline bg-gray-50 dark:bg-ink-800'
            : isDragging
              ? 'border-ember-500 bg-ember-500/10'
              : 'border-gray-300 dark:border-courtline hover:border-ember-400 hover:bg-ember-500/5'
        }`}
        onDragOver={(e) => {
          if (running) return
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          if (running) return
          e.preventDefault()
          setIsDragging(false)
          addFiles(Array.from(e.dataTransfer.files))
        }}
      >
        <p className="text-lg font-black text-gray-900 dark:text-chalk">Drag your videos here</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-chalk-dim">
          {clips.length > 0
            ? `${clips.length} of ${MAX_CLIPS} added`
            : `Up to ${MAX_CLIPS} at a time`}
        </p>
        <button
          type="button"
          disabled={running || clips.length >= MAX_CLIPS}
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
          Only the first {MAX_CLIPS} were added. Run those, then drop in the rest.
        </p>
      )}

      {clips.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-courtline">
          {clips.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 border-b border-gray-100 dark:border-courtline px-4 py-3 last:border-b-0"
            >
              <span className="w-48 shrink-0 truncate text-sm text-gray-700 dark:text-chalk-dim" title={c.file.name}>
                {c.file.name}
              </span>

              <select
                value={c.playerId ?? ''}
                disabled={running || c.state.kind !== 'waiting'}
                onChange={(e) => setClip(c.id, { playerId: e.target.value || null })}
                aria-label={`Player in ${c.file.name}`}
                className="w-44 shrink-0 rounded-lg border border-gray-300 dark:border-courtline dark:bg-ink-800 dark:text-chalk px-2 py-1.5 text-sm disabled:opacity-60"
              >
                <option value="">Who is this?</option>
                {roster.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name_initial}.
                  </option>
                ))}
              </select>

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
                      ? 'font-black text-green-700 dark:text-green-400'
                      : c.state.kind === 'error'
                        ? 'text-red-700 dark:text-red-400'
                        : c.state.kind === 'no_shot'
                          ? 'text-ember-700 dark:text-ember-400'
                          : 'text-gray-500 dark:text-chalk-dim'
                  }`}
                >
                  {label(c)}
                </span>
              </div>

              {c.state.kind === 'done' && (
                <a
                  href={`/team/dashboard/shot/${c.state.token}`}
                  className="shrink-0 text-sm font-bold text-ember-600 dark:text-ember-400 hover:underline"
                >
                  See it
                </a>
              )}
              {!running && c.state.kind === 'waiting' && (
                <button
                  type="button"
                  onClick={() => setClips((prev) => prev.filter((x) => x.id !== c.id))}
                  aria-label={`Remove ${c.file.name}`}
                  className="shrink-0 px-1 text-gray-400 dark:text-chalk-dim hover:text-red-600"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {clips.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={running || readyCount === 0 || notEnoughCredits}
            onClick={start}
            className={backendButton('primary', 'px-7 py-3 text-base')}
          >
            {running ? `Grading… ${finished} of ${clips.length} done` : `Start ${readyCount} video${readyCount === 1 ? '' : 's'}`}
          </button>

          {unassigned > 0 && !running && (
            <span className="text-sm text-ember-700 dark:text-ember-400">
              {unassigned} still {unassigned === 1 ? 'needs' : 'need'} a player.
            </span>
          )}
          {notEnoughCredits && (
            <span className="text-sm text-red-700 dark:text-red-400">
              That is {readyCount} videos but only {credits} credit{credits === 1 ? '' : 's'} left.
            </span>
          )}
          {running && (
            <span className="text-sm text-gray-500 dark:text-chalk-dim">
              Keep this tab open — closing it stops the ones still waiting.
            </span>
          )}
          {!running && graded.length > 0 && (
            <a
              href="/team/dashboard"
              className={backendButton('secondary')}
            >
              See all {graded.length} on the dashboard
            </a>
          )}
        </div>
      )}
    </div>
  )
}
