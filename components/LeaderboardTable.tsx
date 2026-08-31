'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from 'next-themes'

export interface LeaderboardRow {
  id: string
  first_name: string
  last_name_initial: string
  kind: 'member' | 'player'
  best_score: number | string
  avg_score?: number | string | null
  upload_count: number
  // Set for the organization-wide list, so the player's team can be shown.
  team_name?: string
}

type SortMode = 'score-desc' | 'score-asc' | 'avg-desc' | 'name' | 'team'
type Theme = 'light' | 'dark'

// The Team filter's "show everyone" choice. No real team name can collide with
// it: names come from `teams.name`, which is never blank.
const ALL_TEAMS = ''

const SORT_OPTIONS: { mode: SortMode; label: string }[] = [
  { mode: 'name', label: 'Name (A–Z)' },
  { mode: 'score-desc', label: 'Highest score' },
  { mode: 'score-asc', label: 'Lowest score' },
  { mode: 'avg-desc', label: 'Highest average' },
  { mode: 'team', label: 'Team (A–Z)' },
]

// Every themed class the table uses, per theme. The dark variant carries
// print: overrides back to the light palette — dark chalk-on-ink text would
// otherwise print white-on-white.
const THEMES = {
  light: {
    sortBtn: 'text-gray-600 hover:text-black border-gray-200',
    sortBtnValue: 'text-black',
    sortMenu: 'bg-white border-gray-200',
    sortOption: 'text-gray-700 hover:bg-orange-50',
    sortOptionActive: 'font-bold text-orange-600',
    card: 'border-gray-200 bg-white shadow-sm',
    thead: 'bg-gray-50 border-b border-gray-200',
    th: 'text-gray-500',
    tbody: 'divide-gray-100',
    rowTop: 'bg-orange-50/50 hover:bg-orange-50',
    row: 'hover:bg-gray-50',
    name: 'text-black',
    nameLink: 'text-black hover:text-orange-600',
    team: 'text-gray-600',
    avg: 'text-gray-500',
    uploads: 'text-gray-400',
    rankNum: 'text-gray-400',
    rankTints: ['bg-amber-100', 'bg-gray-100', 'bg-orange-100'],
    scoreHigh: 'text-green-600',
    scoreMid: 'text-orange-500',
    scoreLow: 'text-red-500',
  },
  dark: {
    sortBtn: 'text-chalk-dim hover:text-chalk border-courtline',
    sortBtnValue: 'text-chalk',
    sortMenu: 'bg-ink-900 border-courtline',
    sortOption: 'text-chalk-dim hover:bg-ink-800 hover:text-chalk',
    sortOptionActive: 'font-bold text-ember-400',
    card: 'border-courtline bg-ink-900 print:bg-white print:border-gray-200',
    thead: 'bg-ink-950/60 border-b border-courtline print:bg-white print:border-gray-200',
    th: 'text-chalk-dim print:text-gray-500',
    tbody: 'divide-courtline print:divide-gray-100',
    rowTop: 'bg-ember-500/10 hover:bg-ember-500/15 print:bg-white',
    row: 'hover:bg-ink-800 print:bg-white',
    name: 'text-chalk print:text-black',
    nameLink: 'text-chalk hover:text-ember-400 print:text-black',
    team: 'text-chalk-dim print:text-gray-600',
    avg: 'text-chalk-dim print:text-gray-500',
    uploads: 'text-chalk-dim print:text-gray-400',
    rankNum: 'text-chalk-dim print:text-gray-400',
    rankTints: [
      'bg-amber-400/15 print:bg-transparent',
      'bg-chalk/10 print:bg-transparent',
      'bg-ember-500/20 print:bg-transparent',
    ],
    scoreHigh: 'text-green-400 print:text-green-600',
    scoreMid: 'text-ember-400 print:text-orange-500',
    scoreLow: 'text-red-400 print:text-red-500',
  },
} as const

// Themed dropdown behind both the "Sort by" and "Team" controls. Each instance
// owns its open state and outside-click listener so the two menus close
// independently. It can't reuse <SortMenu> because this table themes itself
// from a lookup table rather than `dark:` classes.
function Menu<T extends string>({
  label,
  value,
  options,
  onChange,
  t,
  isDark,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  t: (typeof THEMES)[Theme]
  isDark: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const currentLabel = options.find((o) => o.value === value)?.label ?? ''

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 text-sm font-semibold border rounded-lg px-3 py-1.5 transition-colors ${t.sortBtn}`}
      >
        {label}: <span className={`max-w-[9rem] truncate ${t.sortBtnValue}`}>{currentLabel}</span>
        <span className={`transition-transform ${open ? 'rotate-180' : ''} ${isDark ? 'text-chalk-dim' : 'text-gray-400'}`}>▾</span>
      </button>
      {open && (
        <div className={`absolute right-0 top-full mt-1 z-40 w-52 max-h-72 overflow-y-auto border rounded-xl shadow-lg py-1 ${t.sortMenu}`}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
              className={`block w-full text-left px-4 py-2 text-sm truncate transition-colors ${
                opt.value === value ? t.sortOptionActive : t.sortOption
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function formatPlayerName(firstName: string, lastNameInitial: string | null) {
  if (!lastNameInitial) return firstName
  if (lastNameInitial.length === 1) return `${firstName} ${lastNameInitial}.`
  return `${firstName} ${lastNameInitial}`
}

function scoreColor(score: number, t: (typeof THEMES)[Theme]) {
  if (score >= 8) return t.scoreHigh
  if (score >= 6) return t.scoreMid
  return t.scoreLow
}

// Fixed-size rank badge so medal rows and numbered rows stay aligned.
function RankBadge({ rank, t }: { rank: number; t: (typeof THEMES)[Theme] }) {
  if (rank <= 3) {
    return (
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-base ${t.rankTints[rank - 1]}`}>
        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
      </span>
    )
  }
  return (
    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold tabular-nums ${t.rankNum}`}>
      {rank}
    </span>
  )
}

// Player name links to the analyses detail page. `context` picks the routes:
// 'team' for the coach dashboard, 'org' for the organization dashboard, and
// 'player' for the player-facing list, where the coach pages aren't
// accessible so names never link.
function detailHref(entry: LeaderboardRow, context: 'team' | 'org' | 'player'): string | null {
  if (context === 'player') return null
  if (entry.kind === 'member') {
    return context === 'org'
      ? `/org/dashboard/member/${entry.id}`
      : `/team/dashboard/member/${entry.id}`
  }
  // Coach-added players only have a detail page in the team dashboard.
  return context === 'org' ? null : `/team/dashboard/player/${entry.id}`
}

// A player can appear once per team in the org-wide list, so the row key must
// include the team to stay unique.
export function leaderboardRowKey(e: LeaderboardRow, showTeam: boolean) {
  return showTeam ? `${e.id}::${e.team_name ?? ''}` : e.id
}

/**
 * Everything the table displays, derived from the raw rows and the two
 * controls: which team is selected and how the rows are ordered. Pure and
 * exported so `scripts/test-leaderboard.ts` can drive it without a DOM.
 *
 * Ranks come from Best score *within the visible slice* — "All teams" ranks
 * across the organization, one team ranks 1..n inside it, matching that team's
 * own board — and never change with the sort order.
 */
export function buildView(
  entries: LeaderboardRow[],
  { team, sort, showTeam }: { team: string; sort: SortMode; showTeam: boolean },
): { rows: LeaderboardRow[]; rankByKey: Record<string, number> } {
  const visible = team === ALL_TEAMS ? entries : entries.filter((e) => e.team_name === team)

  const rankByKey: Record<string, number> = {}
  ;[...visible]
    .sort((a, b) => Number(b.best_score) - Number(a.best_score))
    .forEach((e, i) => {
      rankByKey[leaderboardRowKey(e, showTeam)] = i + 1
    })

  const rows = [...visible]
  if (sort === 'team') {
    // Group the org-wide list by team, best score first inside each team.
    rows.sort(
      (a, b) =>
        (a.team_name ?? '').localeCompare(b.team_name ?? '') ||
        Number(b.best_score) - Number(a.best_score),
    )
  } else if (sort === 'name') {
    rows.sort((a, b) =>
      formatPlayerName(a.first_name, a.last_name_initial).localeCompare(
        formatPlayerName(b.first_name, b.last_name_initial),
      ),
    )
  } else if (sort === 'score-asc') {
    rows.sort((a, b) => Number(a.best_score) - Number(b.best_score))
  } else if (sort === 'avg-desc') {
    rows.sort((a, b) => Number(b.avg_score ?? -1) - Number(a.avg_score ?? -1))
  } else {
    rows.sort((a, b) => Number(b.best_score) - Number(a.best_score))
  }

  return { rows, rankByKey }
}

// Which teams a board can be filtered to. Only the org-wide list (showTeam)
// ever spans more than one, and filtering means nothing below two — so a
// single-team board gets no Team control at all.
export function leaderboardTeamNames(entries: LeaderboardRow[], showTeam: boolean): string[] {
  if (!showTeam) return []
  const names = new Set(entries.map((e) => e.team_name).filter((n): n is string => !!n))
  return [...names].sort((a, b) => a.localeCompare(b))
}

// Team / organization leaderboard table with a "Sort by" control. Each player's
// Best is the highest score recorded on their account and Avg the mean across
// all their uploads; their Rank always reflects the Best standing, no matter
// which sort order is shown. Pass `showTeam` for the org-wide list to add a
// Team column plus a "Team" filter (once two or more teams are present) that
// narrows the table to one team and re-ranks 1..n inside it, and theme="dark"
// on Broadcast Court (ink/chalk/ember) pages.
export default function LeaderboardTable({
  entries,
  context = 'team',
  showTeam = false,
  theme = 'light',
}: {
  entries: LeaderboardRow[]
  context?: 'team' | 'org' | 'player'
  showTeam?: boolean
  /**
   * 'auto' follows the user's chosen theme. It exists because this table
   * themes itself from a lookup table rather than CSS, so the account pages'
   * `dark:` classes cannot reach it. Broadcast Court pages pass 'dark'.
   */
  theme?: Theme | 'auto'
}) {
  const [sortMode, setSortMode] = useState<SortMode>('score-desc')
  const [teamFilter, setTeamFilter] = useState<string>(ALL_TEAMS)
  // resolvedTheme collapses "system" to the light/dark actually on screen. It
  // is undefined until mount, so 'auto' falls back to light for the server
  // render and the first client pass, which keeps the two matching.
  const { resolvedTheme } = useTheme()
  const isDark = theme === 'auto' ? resolvedTheme === 'dark' : theme === 'dark'
  const t = THEMES[isDark ? 'dark' : 'light']

  // Older callers may not send avg_score yet — drop the column (and its sort
  // option) instead of rendering a dash for everyone.
  const hasAvg = entries.some((e) => e.avg_score != null)

  const teamNames = useMemo(() => leaderboardTeamNames(entries, showTeam), [entries, showTeam])
  const canFilterByTeam = teamNames.length > 1

  // The chosen team can disappear when `entries` changes (a team is removed, or
  // its last analyzed shot is deleted). Resolve the filter during render rather
  // than correcting it in an effect, so the table can never sit empty under a
  // team name that no longer exists.
  const activeTeam = teamNames.includes(teamFilter) ? teamFilter : ALL_TEAMS

  // "Team (A–Z)" only groups something while every team is on screen.
  const sortOptions = SORT_OPTIONS.filter(
    (o) =>
      (o.mode !== 'avg-desc' || hasAvg) &&
      (o.mode !== 'team' || (canFilterByTeam && activeTeam === ALL_TEAMS)),
  )

  const teamOptions = useMemo(
    () => [{ value: ALL_TEAMS, label: 'All teams' }, ...teamNames.map((n) => ({ value: n, label: n }))],
    [teamNames],
  )

  const { rows: sortedEntries, rankByKey } = useMemo(
    () => buildView(entries, { team: activeTeam, sort: sortMode, showTeam }),
    [entries, activeTeam, sortMode, showTeam],
  )

  // Once the board is narrowed to one team the Team column repeats that name on
  // every row, so it drops out and the line above the table carries it instead.
  const showTeamColumn = showTeam && activeTeam === ALL_TEAMS

  // Narrowing to one team retires the "Team (A–Z)" sort, so fall back to the
  // default rather than leaving the control labelled for a mode that's gone.
  function changeTeamFilter(next: string) {
    setTeamFilter(next)
    if (next !== ALL_TEAMS && sortMode === 'team') setSortMode('score-desc')
  }

  return (
    <div className="space-y-2">
      {/* Team filter (org-wide board only) + sort control */}
      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        {canFilterByTeam && (
          <Menu
            label="Team"
            value={activeTeam}
            options={teamOptions}
            onChange={changeTeamFilter}
            t={t}
            isDark={isDark}
          />
        )}
        <Menu
          label="Sort by"
          value={sortMode}
          options={sortOptions.map((o) => ({ value: o.mode, label: o.label }))}
          onChange={setSortMode}
          t={t}
          isDark={isDark}
        />
      </div>

      {/* Which slice is on screen. Also the only team label on a printout,
          since the filter control itself is print:hidden. */}
      {canFilterByTeam && activeTeam !== ALL_TEAMS && (
        <p className={`text-xs font-semibold ${t.team}`}>
          Showing {sortedEntries.length} player{sortedEntries.length !== 1 ? 's' : ''} on {activeTeam}
        </p>
      )}

      <div className={`border rounded-2xl overflow-hidden ${t.card}`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={t.thead}>
              <tr>
                <th className={`pl-4 pr-2 py-3 text-left text-xs font-semibold uppercase tracking-wide w-12 ${t.th}`}>Rank</th>
                <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${t.th}`}>Player</th>
                {showTeamColumn && (
                  <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${t.th}`}>Team</th>
                )}
                <th className={`px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide ${t.th}`}>Best</th>
                {hasAvg && (
                  <th className={`px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide ${t.th}`}>Avg</th>
                )}
                <th className={`px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide ${t.th}`}>Uploads</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${t.tbody}`}>
              {sortedEntries.map((entry) => {
                const score = Number(entry.best_score)
                const avg = entry.avg_score != null ? Number(entry.avg_score) : null
                const name = formatPlayerName(entry.first_name, entry.last_name_initial)
                const href = detailHref(entry, context)
                const key = leaderboardRowKey(entry, showTeam)
                const rank = rankByKey[key]
                return (
                  <tr key={key} className={`transition-colors ${rank === 1 ? t.rowTop : t.row}`}>
                    <td className="pl-4 pr-2 py-2.5">
                      <RankBadge rank={rank} t={t} />
                    </td>
                    <td className="px-4 py-2.5 font-semibold whitespace-nowrap">
                      {href ? (
                        <Link href={href} className={`hover:underline transition-colors ${t.nameLink}`}>
                          {name}
                        </Link>
                      ) : (
                        <span className={t.name}>{name}</span>
                      )}
                    </td>
                    {showTeamColumn && (
                      <td className={`px-4 py-2.5 text-sm whitespace-nowrap ${t.team}`}>{entry.team_name ?? '—'}</td>
                    )}
                    <td className={`px-4 py-2.5 text-right font-black tabular-nums ${scoreColor(score, t)}`}>
                      {score.toFixed(1)}
                    </td>
                    {hasAvg && (
                      <td className={`px-4 py-2.5 text-right text-sm font-semibold tabular-nums ${t.avg}`}>
                        {avg != null ? avg.toFixed(1) : '—'}
                      </td>
                    )}
                    <td className={`px-4 py-2.5 text-right text-sm tabular-nums ${t.uploads}`}>
                      {entry.upload_count}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
