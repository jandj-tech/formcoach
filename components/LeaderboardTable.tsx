'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

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

type SortMode = 'score-desc' | 'score-asc' | 'avg-desc' | 'name'
type Theme = 'light' | 'dark'

const SORT_OPTIONS: { mode: SortMode; label: string }[] = [
  { mode: 'name', label: 'Name (A–Z)' },
  { mode: 'score-desc', label: 'Highest score' },
  { mode: 'score-asc', label: 'Lowest score' },
  { mode: 'avg-desc', label: 'Highest average' },
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
    thead: 'bg-gray-50/80 border-b border-gray-200',
    th: 'text-gray-500',
    tbody: 'divide-gray-100',
    rowTop: 'bg-amber-50/40 hover:bg-amber-50/70',
    row: 'hover:bg-gray-50',
    name: 'text-gray-900',
    nameLink: 'text-gray-900 hover:text-orange-600',
    team: 'text-gray-500',
    avg: 'text-gray-500',
    uploads: 'text-gray-400',
    rankNum: 'text-gray-400',
    // Top-3 rank badges: numbered, tinted — no medals, no emoji.
    rankTints: [
      'bg-amber-100 text-amber-800',
      'bg-gray-200 text-gray-700',
      'bg-orange-100 text-orange-800',
    ],
    scoreHigh: 'text-green-700',
    scoreMid: 'text-orange-600',
    scoreLow: 'text-red-600',
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
      'bg-amber-400/15 text-amber-300 print:bg-transparent print:text-amber-800',
      'bg-chalk/10 text-chalk print:bg-transparent print:text-gray-700',
      'bg-ember-500/20 text-ember-400 print:bg-transparent print:text-orange-800',
    ],
    scoreHigh: 'text-green-400 print:text-green-700',
    scoreMid: 'text-ember-400 print:text-orange-600',
    scoreLow: 'text-red-400 print:text-red-600',
  },
} as const

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

// Fixed-size numbered rank badge. The top three get a subtle tinted disc
// (gold / silver / bronze hues) but stay as plain numerals — professional,
// print-safe, and consistent with the rest of the table.
function RankBadge({ rank, t }: { rank: number; t: (typeof THEMES)[Theme] }) {
  if (rank <= 3) {
    return (
      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums ${t.rankTints[rank - 1]}`}>
        {rank}
      </span>
    )
  }
  return (
    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${t.rankNum}`}>
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

// Team / organization leaderboard table with a "Sort by" control. Each player's
// Best is the highest score recorded on their account and Avg the mean across
// all their uploads; their Rank always reflects the Best standing, no matter
// which sort order is shown. Pass `showTeam` for the org-wide list to add a
// Team column, and theme="dark" on Broadcast Court (ink/chalk/ember) pages.
export default function LeaderboardTable({
  entries,
  context = 'team',
  showTeam = false,
  theme = 'light',
}: {
  entries: LeaderboardRow[]
  context?: 'team' | 'org' | 'player'
  showTeam?: boolean
  theme?: Theme
}) {
  const [sortMode, setSortMode] = useState<SortMode>('score-desc')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const t = THEMES[theme]

  // Older callers may not send avg_score yet — drop the column (and its sort
  // option) instead of rendering a dash for everyone.
  const hasAvg = entries.some((e) => e.avg_score != null)
  const sortOptions = hasAvg ? SORT_OPTIONS : SORT_OPTIONS.filter((o) => o.mode !== 'avg-desc')

  // Close the dropdown on any click outside it.
  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  // A player can appear once per team in the org-wide list, so the row key
  // (and rank lookup) must include the team to stay unique.
  function rowKey(e: LeaderboardRow) {
    return showTeam ? `${e.id}::${e.team_name ?? ''}` : e.id
  }

  // Each row's rank by best score — fixed regardless of the display order.
  const rankByKey = useMemo(() => {
    const map: Record<string, number> = {}
    ;[...entries]
      .sort((a, b) => Number(b.best_score) - Number(a.best_score))
      .forEach((e, i) => {
        map[showTeam ? `${e.id}::${e.team_name ?? ''}` : e.id] = i + 1
      })
    return map
  }, [entries, showTeam])

  const sortedEntries = useMemo(() => {
    const copy = [...entries]
    if (sortMode === 'name') {
      copy.sort((a, b) =>
        formatPlayerName(a.first_name, a.last_name_initial).localeCompare(
          formatPlayerName(b.first_name, b.last_name_initial),
        ),
      )
    } else if (sortMode === 'score-asc') {
      copy.sort((a, b) => Number(a.best_score) - Number(b.best_score))
    } else if (sortMode === 'avg-desc') {
      copy.sort((a, b) => Number(b.avg_score ?? -1) - Number(a.avg_score ?? -1))
    } else {
      copy.sort((a, b) => Number(b.best_score) - Number(a.best_score))
    }
    return copy
  }, [entries, sortMode])

  const currentLabel = sortOptions.find((o) => o.mode === sortMode)?.label ?? SORT_OPTIONS[1].label

  return (
    <div className="space-y-2">
      {/* Sort control */}
      <div className="flex justify-end print:hidden">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className={`flex items-center gap-1.5 text-sm font-medium border rounded-lg px-3 py-1.5 transition-colors ${t.sortBtn}`}
          >
            Sort by: <span className={`font-semibold ${t.sortBtnValue}`}>{currentLabel}</span>
            <svg
              className={`w-3.5 h-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''} ${theme === 'dark' ? 'text-chalk-dim' : 'text-gray-400'}`}
              viewBox="0 0 20 20" fill="currentColor" aria-hidden
            >
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>
          {menuOpen && (
            <div className={`absolute right-0 top-full mt-1 z-40 w-44 border rounded-xl shadow-lg overflow-hidden py-1 ${t.sortMenu}`}>
              {sortOptions.map((opt) => (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => {
                    setSortMode(opt.mode)
                    setMenuOpen(false)
                  }}
                  className={`block w-full text-left px-4 py-2 text-sm transition-colors ${
                    opt.mode === sortMode ? t.sortOptionActive : t.sortOption
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`border rounded-2xl overflow-hidden ${t.card}`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={t.thead}>
              <tr>
                <th className={`pl-4 pr-2 py-3 text-left text-[11px] font-semibold uppercase tracking-wider w-12 ${t.th}`}>Rank</th>
                <th className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider ${t.th}`}>Player</th>
                {showTeam && (
                  <th className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider ${t.th}`}>Team</th>
                )}
                <th className={`px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider ${t.th}`}>Best</th>
                {hasAvg && (
                  <th className={`px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider ${t.th}`}>Avg</th>
                )}
                <th className={`px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider ${t.th}`}>Uploads</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${t.tbody}`}>
              {sortedEntries.map((entry) => {
                const score = Number(entry.best_score)
                const avg = entry.avg_score != null ? Number(entry.avg_score) : null
                const name = formatPlayerName(entry.first_name, entry.last_name_initial)
                const href = detailHref(entry, context)
                const key = rowKey(entry)
                const rank = rankByKey[key]
                return (
                  <tr key={key} className={`transition-colors ${rank === 1 ? t.rowTop : t.row}`}>
                    <td className="pl-4 pr-2 py-2.5">
                      <RankBadge rank={rank} t={t} />
                    </td>
                    <td className="px-4 py-2.5 text-sm font-medium whitespace-nowrap">
                      {href ? (
                        <Link href={href} className={`hover:underline transition-colors ${t.nameLink}`}>
                          {name}
                        </Link>
                      ) : (
                        <span className={t.name}>{name}</span>
                      )}
                    </td>
                    {showTeam && (
                      <td className={`px-4 py-2.5 text-sm whitespace-nowrap ${t.team}`}>{entry.team_name ?? '—'}</td>
                    )}
                    <td className={`px-4 py-2.5 text-right text-sm font-bold tabular-nums ${scoreColor(score, t)}`}>
                      {score.toFixed(1)}
                    </td>
                    {hasAvg && (
                      <td className={`px-4 py-2.5 text-right text-sm tabular-nums ${t.avg}`}>
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
