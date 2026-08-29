'use client'

import { useCallback, useState } from 'react'
import { copyToClipboard } from '@/lib/copy'

interface FeedLinks {
  https: string
  webcal: string
  google: string
  canRotate: boolean
}

/**
 * "Add to calendar" for a team schedule.
 *
 * Subscription, not download. A downloaded .ics is a photograph: the practice
 * that moves on Thursday stays wrong in everyone's phone forever, which is the
 * failure people actually report. A subscribed feed re-fetches, so a coach
 * editing the schedule here changes it on every phone that took the link.
 *
 * The buttons are three shapes of one URL because the platforms disagree:
 * Apple and iOS want `webcal:` (an https link downloads a snapshot instead —
 * exactly the trap above), Google wants its own add-by-URL endpoint, and
 * everything else takes the raw https link pasted in by hand.
 */
export default function AddToCalendar({ teamId, dark }: { teamId: string; dark: boolean }) {
  const [open, setOpen] = useState(false)
  const [links, setLinks] = useState<FeedLinks | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)

  const text = dark ? 'text-chalk' : 'text-black'
  const dim = dark ? 'text-chalk-dim' : 'text-gray-500'
  const link = dark ? 'text-ember-400 hover:text-ember-300' : 'text-orange-600 hover:text-orange-500'
  const panel = dark ? 'bg-ink-950 border border-courtline' : 'bg-white border border-gray-200'
  const btn = dark
    ? 'border border-courtline text-chalk hover:border-chalk-dim'
    : 'bg-white border border-gray-300 text-gray-700 hover:border-gray-400'

  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/team/schedule/feed?teamId=${encodeURIComponent(teamId)}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'Could not create your calendar link.')
        return
      }
      setLinks(data as FeedLinks)
    } catch {
      setError('Could not create your calendar link.')
    } finally {
      setBusy(false)
    }
  }, [teamId])

  const toggle = useCallback(() => {
    setOpen(prev => {
      // The token is minted server-side on first ask, so the link only exists
      // for a team that actually opens this.
      if (!prev && !links && !busy) void load()
      return !prev
    })
  }, [links, busy, load])

  const reset = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/team/schedule/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'Could not reset the link.')
        return
      }
      setLinks(data as FeedLinks)
      setConfirmingReset(false)
    } catch {
      setError('Could not reset the link.')
    } finally {
      setBusy(false)
    }
  }, [teamId])

  const copy = useCallback(async () => {
    if (!links) return
    await copyToClipboard(links.https, 'Calendar link copied!')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }, [links])

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={`text-sm font-semibold transition-colors ${link}`}
      >
        📅 Add to your calendar {open ? '▴' : '▾'}
      </button>

      {open && (
        <div className={`mt-2 rounded-xl p-4 space-y-3 ${panel}`}>
          {busy && !links && <p className={`text-sm ${dim}`}>Creating your link…</p>}
          {error && (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          )}

          {links && (
            <>
              <p className={`text-xs ${dim}`}>
                Subscribe once and the schedule keeps itself up to date — when your coach adds
                or moves a practice, it changes on your phone.
              </p>

              <div className="flex flex-wrap gap-2">
                <a
                  href={links.webcal}
                  className={`rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${btn}`}
                >
                  Apple Calendar
                </a>
                <a
                  href={links.google}
                  target="_blank"
                  rel="noreferrer"
                  className={`rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${btn}`}
                >
                  Google Calendar
                </a>
                <button
                  type="button"
                  onClick={copy}
                  className={`rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${btn}`}
                >
                  {copied ? 'Copied ✓' : 'Copy link'}
                </button>
                <a
                  href={`${links.https}?download=1`}
                  className={`rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${btn}`}
                >
                  Download .ics
                </a>
              </div>

              <p className={`text-xs ${dim}`}>
                On Android, or anywhere else, paste the copied link into your calendar app&rsquo;s
                &ldquo;subscribe&rdquo; or &ldquo;add by URL&rdquo; option. A downloaded{' '}
                <span className="font-mono">.ics</span> is a one-time snapshot and won&rsquo;t
                update.
              </p>

              {links.canRotate && (
                <div className={`pt-2 border-t ${dark ? 'border-courtline' : 'border-gray-200'}`}>
                  {confirmingReset ? (
                    <div className="space-y-2">
                      <p className={`text-xs ${text}`}>
                        This makes a new link. Everyone who already subscribed stops getting
                        updates until you send them the new one.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={reset}
                          disabled={busy}
                          className="rounded-lg bg-red-500 hover:bg-red-400 text-white text-xs font-bold px-3 py-1.5 disabled:opacity-50"
                        >
                          {busy ? 'Resetting…' : 'Yes, reset it'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingReset(false)}
                          className={`rounded-lg text-xs font-bold px-3 py-1.5 ${btn}`}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingReset(true)}
                      className={`text-xs font-semibold ${dim} hover:text-red-500 transition-colors`}
                    >
                      Reset link — if it reached someone it shouldn&rsquo;t have
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
