'use client'

import { useId, useState, type ReactNode } from 'react'
import { EyeIcon, EyeOffIcon, LockIcon } from 'lucide-react'

export type LeaderboardVisibility = 'team' | 'hidden'

// Plain-language failure copy, by status from POST /api/team/leaderboard-visibility.
function failureText(status: number, serverError?: string): string {
  if (status === 401) return 'You have been signed out. Sign in again to change this.'
  if (status === 403) return 'You can’t change this setting for this team.'
  if (status === 404) return 'This team could not be found. Reload the page and try again.'
  if (status === 400 && serverError) return serverError
  return 'Could not save the change. Check your connection and try again.'
}

/**
 * The one switch that decides whether players see the whole team leaderboard.
 *
 * Controlled: the parent owns `visibility` so the "Private" badge on the tab
 * label flips the moment the switch does. The change is applied optimistically
 * and rolled back (with a plain error line) if the server refuses it.
 * Coaches and org admins always see the full board either way.
 */
export default function LeaderboardVisibilitySwitch({
  teamId,
  visibility,
  onChange,
}: {
  teamId: string
  visibility: LeaderboardVisibility
  onChange: (next: LeaderboardVisibility) => void
}) {
  const id = useId()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const on = visibility === 'team'

  async function toggle() {
    if (saving) return
    const prev = visibility
    const next: LeaderboardVisibility = on ? 'hidden' : 'team'
    setError('')
    setSaving(true)
    onChange(next)
    try {
      const res = await fetch('/api/team/leaderboard-visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, visibility: next }),
      })
      const data = await res.json().catch(() => ({})) as { visibility?: string; error?: string }
      if (!res.ok) {
        onChange(prev)
        setError(failureText(res.status, data.error))
      } else if (data.visibility === 'team' || data.visibility === 'hidden') {
        onChange(data.visibility)
      }
    } catch {
      onChange(prev)
      setError(failureText(0))
    } finally {
      setSaving(false)
    }
  }

  const Icon = on ? EyeIcon : EyeOffIcon

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-courtline bg-white dark:bg-ink-900 px-4 py-3.5 sm:px-5">
      <div className="flex items-start gap-3">
        <Icon aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${on ? 'text-ember-500 dark:text-ember-400' : 'text-gray-400 dark:text-chalk-dim'}`} />
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-switch`} id={`${id}-label`} className="block cursor-pointer text-sm font-semibold text-gray-900 dark:text-chalk">
            Players can see the team leaderboard
          </label>
          <p id={`${id}-desc`} className="mt-0.5 text-sm text-gray-500 dark:text-chalk-dim">
            {on
              ? 'Every player sees everyone’s best score and shot count, ranked.'
              : 'Players see only their own scores. You and your coaches still see everyone.'}
          </p>
        </div>
        <button
          id={`${id}-switch`}
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-desc${error ? ` ${id}-err` : ''}`}
          aria-busy={saving}
          // Not `disabled` while saving: a disabled button drops keyboard
          // focus, so a second Space press would go nowhere. toggle() ignores
          // presses until the save settles instead.
          onClick={toggle}
          className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-400 ${saving ? 'cursor-wait opacity-70' : 'cursor-pointer'} ${
            on ? 'bg-ember-500' : 'bg-gray-300 dark:bg-ink-700'
          }`}
        >
          <span
            aria-hidden
            className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-5.5' : 'translate-x-0.5'}`}
          />
        </button>
      </div>
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-2 pl-7 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

/** Small "Private" pill shown beside the Leaderboard tab label while hidden. */
export function LeaderboardPrivateBadge() {
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-courtline bg-white dark:bg-ink-900 px-1.5 py-0.5 align-middle text-[10px] font-semibold leading-none text-gray-600 dark:text-chalk-dim">
      <LockIcon aria-hidden className="h-2.5 w-2.5" />
      Private
    </span>
  )
}

/**
 * Tab label for the Leaderboard tab: plain text while players can see it,
 * text plus the Private pill while hidden.
 */
export function leaderboardTabLabel(visibility: LeaderboardVisibility): ReactNode {
  if (visibility === 'team') return 'Leaderboard'
  return (
    <>
      Leaderboard
      <LeaderboardPrivateBadge />
    </>
  )
}
