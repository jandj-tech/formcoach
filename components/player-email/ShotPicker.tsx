'use client'

import { useId, useMemo, useState } from 'react'
import { ChevronRightIcon, SearchIcon } from 'lucide-react'
import type { PlayerEmailShotMode } from '@/lib/player-email-templates'
import { PLAYER_EMAIL_LIMITS } from '@/lib/player-email-templates'
import { CHECKBOX, INPUT, plural, shotDate, shotsOf, unsentShots, type Recipient } from './types'

// "Which shots?" — shown under "Each player's latest score" when a selected
// player has more than one graded shot. Latest (the classic email), every
// shot not emailed yet, or hand-picked per player. Hand-picking lists only
// the players with 2+ shots (everyone else just gets their one shot), grouped
// by team and collapsible, so a 50-player send stays scannable. The server
// re-checks every picked id against the shots it holds for that player.

const MAX = PLAYER_EMAIL_LIMITS.shotsPerPlayer

export type ShotPicks = Record<string, string[]>

/** The shots a recipient gets in 'pick' mode: their ticks, else their latest. */
export function pickedFor(r: Recipient, picks: ShotPicks): string[] {
  const all = shotsOf(r.player)
  const mine = picks[r.id]?.filter((id) => all.some((s) => s.submissionId === id))
  return mine && mine.length ? mine : all.length ? [all[0].submissionId] : []
}

function scoreTone(score: number): string {
  if (score >= 8) return 'text-green-700 dark:text-green-400'
  if (score >= 6) return 'text-orange-600 dark:text-orange-400'
  return 'text-red-600 dark:text-red-400'
}

export default function ShotPicker({
  mode,
  multi,
  picks,
  disabled,
  onMode,
  onPicks,
}: {
  mode: PlayerEmailShotMode
  /** Selected recipients with 2+ graded shots. */
  multi: Recipient[]
  picks: ShotPicks
  disabled: boolean
  onMode: (mode: PlayerEmailShotMode) => void
  onPicks: (picks: ShotPicks) => void
}) {
  const name = useId()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const noneNew = multi.filter((r) => unsentShots(r.player).length === 0).length
  const newTotal = multi.reduce((n, r) => n + Math.min(MAX, unsentShots(r.player).length), 0)
  const pickedTotal = multi.reduce((n, r) => n + pickedFor(r, picks).length, 0)

  const byTeam = useMemo(() => {
    const m = new Map<string, { name: string; list: Recipient[] }>()
    for (const r of multi) {
      if (q && !r.player.name.toLowerCase().includes(q)) continue
      const g = m.get(r.team.id) ?? { name: r.team.name, list: [] }
      g.list.push(r)
      m.set(r.team.id, g)
    }
    return [...m.entries()]
  }, [multi, q])

  function toggle(r: Recipient, id: string) {
    const cur = pickedFor(r, picks)
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    if (next.length === 0 || next.length > MAX) return
    onPicks({ ...picks, [r.id]: next })
  }
  function latestForAll() {
    const next: ShotPicks = {}
    for (const r of multi) next[r.id] = [shotsOf(r.player)[0].submissionId]
    onPicks(next)
  }
  function allForAll() {
    const next: ShotPicks = {}
    for (const r of multi) next[r.id] = shotsOf(r.player).slice(0, MAX).map((s) => s.submissionId)
    onPicks(next)
  }

  const options: Array<{ id: PlayerEmailShotMode; label: string; hint: string }> = [
    { id: 'latest', label: 'Latest shot', hint: 'Each player’s newest graded shot.' },
    {
      id: 'unsent',
      label: 'New since their last results email',
      hint: noneNew
        ? `${plural(newTotal, 'shot')} not emailed yet. ${plural(noneNew, 'player has', 'players have')} nothing new and will be skipped.`
        : `${plural(newTotal, 'shot')} not emailed yet.`,
    },
    { id: 'pick', label: 'Pick shots…', hint: 'Choose the shots for each player.' },
  ]

  return (
    <div className="mx-3 mb-2 mt-1 rounded-xl border border-gray-200 dark:border-courtline bg-gray-50/70 dark:bg-ink-950/50 p-3 space-y-3">
      <fieldset>
        <legend className="text-xs font-semibold text-gray-900 dark:text-chalk">
          Which shots?{' '}
          <span className="font-normal text-gray-500 dark:text-chalk-dim">
            {plural(multi.length, 'selected player has', 'selected players have')} more than one graded shot.
          </span>
        </legend>
        <div className="mt-2 space-y-1">
          {options.map((o) => (
            <label key={o.id} className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 ${disabled ? '' : 'cursor-pointer hover:bg-white dark:hover:bg-ink-800/60'}`}>
              <input
                type="radio"
                name={name}
                className="mt-0.5 w-4 h-4 shrink-0 accent-ember-500"
                checked={mode === o.id}
                disabled={disabled}
                onChange={() => onMode(o.id)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900 dark:text-chalk">{o.label}</span>
                <span className="block text-xs text-gray-500 dark:text-chalk-dim">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {mode === 'pick' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={disabled} onClick={latestForAll} className="rounded-lg border border-gray-300 dark:border-courtline bg-white dark:bg-ink-900 px-2.5 py-1 text-xs font-semibold text-gray-800 dark:text-chalk hover:border-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400">
              Latest for everyone
            </button>
            <button type="button" disabled={disabled} onClick={allForAll} className="rounded-lg border border-gray-300 dark:border-courtline bg-white dark:bg-ink-900 px-2.5 py-1 text-xs font-semibold text-gray-800 dark:text-chalk hover:border-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400">
              All for everyone
            </button>
            <span className="text-xs text-gray-500 dark:text-chalk-dim" aria-live="polite">
              {plural(pickedTotal, 'shot')} for {plural(multi.length, 'player')}
            </span>
          </div>
          {multi.length > 8 && (
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a player"
                aria-label="Find a player"
                className={`${INPUT} py-1.5 pl-8 text-xs`}
              />
            </div>
          )}
          <div className="max-h-[26rem] overflow-y-auto space-y-1.5 pr-0.5">
            {byTeam.length === 0 && <p className="px-1 py-2 text-xs text-gray-500 dark:text-chalk-dim">No player matches.</p>}
            {byTeam.map(([teamId, g]) => (
              <details key={teamId} open={byTeam.length === 1 || g.list.length <= 6 || !!q} className="group rounded-lg border border-gray-200 dark:border-courtline bg-white dark:bg-ink-900">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-900 dark:text-chalk rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400 [&::-webkit-details-marker]:hidden">
                  <ChevronRightIcon className="w-3.5 h-3.5 text-gray-400 transition-transform group-open:rotate-90" aria-hidden />
                  <span className="flex-1 min-w-0 truncate">{g.name}</span>
                  <span className="font-medium text-gray-500 dark:text-chalk-dim">{plural(g.list.length, 'player')}</span>
                </summary>
                <ul className="border-t border-gray-100 dark:border-courtline divide-y divide-gray-100 dark:divide-courtline">
                  {g.list.map((r) => {
                    const chosen = new Set(pickedFor(r, picks))
                    const shots = shotsOf(r.player)
                    // Several shots on one day: show the time too, so they can be told apart.
                    const days = shots.map((s) => shotDate(s.gradedAt))
                    const sameDay = new Set(days).size < days.length
                    return (
                      <li key={r.id} className="px-3 py-2">
                        <p className="text-xs font-semibold text-gray-900 dark:text-chalk">
                          {r.player.name}
                          {r.player.sameNameAsAnother && (
                            <span className="ml-1 font-normal text-gray-500 dark:text-chalk-dim [overflow-wrap:anywhere]">({r.player.email ?? r.player.detail})</span>
                          )}
                          <span className="ml-1.5 font-normal text-gray-500 dark:text-chalk-dim">
                            {chosen.size} of {shots.length}
                          </span>
                        </p>
                        <div role="group" aria-label={`Shots for ${r.player.name}`} className="mt-1.5 flex flex-wrap gap-1.5">
                          {shots.map((s) => {
                            const on = chosen.has(s.submissionId)
                            const lock = (on && chosen.size === 1) || (!on && chosen.size >= MAX)
                            return (
                              <label
                                key={s.submissionId}
                                title={s.sentAt ? `Results emailed ${shotDate(s.sentAt)}` : 'Not emailed yet'}
                                className={`inline-flex items-center gap-1.5 rounded-lg border px-1.5 py-1 text-xs transition-colors ${
                                  on
                                    ? 'border-ember-500 bg-ember-500/10 text-gray-900 dark:text-chalk'
                                    : 'border-gray-200 dark:border-courtline text-gray-700 dark:text-chalk-dim'
                                } ${disabled || lock ? 'cursor-default' : 'cursor-pointer hover:border-gray-400'}`}
                              >
                                <input
                                  type="checkbox"
                                  className={CHECKBOX}
                                  checked={on}
                                  disabled={disabled || lock}
                                  onChange={() => toggle(r, s.submissionId)}
                                  aria-label={`${shotDate(s.gradedAt, sameDay)}, score ${s.score.toFixed(1)}${s.sentAt ? ', already emailed' : ''}`}
                                />
                                {s.thumb ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={s.thumb} alt="" className="w-6 h-6 rounded object-cover bg-gray-200 dark:bg-ink-700" />
                                ) : null}
                                <span>{shotDate(s.gradedAt, sameDay)}</span>
                                <span className={`font-bold tabular-nums ${scoreTone(s.score)}`}>{s.score.toFixed(1)}</span>
                                {!s.sentAt && <span className="rounded bg-ember-500/15 px-1 text-[10px] font-bold uppercase tracking-wide text-ember-700 dark:text-ember-400">New</span>}
                              </label>
                            )
                          })}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </details>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 dark:text-chalk-dim">Up to {MAX} shots per player. Players with one graded shot get that one.</p>
        </div>
      )}
    </div>
  )
}
