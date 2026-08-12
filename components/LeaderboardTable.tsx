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

const SORT_OPTIONS: { mode: SortMode; label: string }[] = [
  { mode: 'name', label: 'Name (A–Z)' },
  { mode: 'score-desc', label: 'Highest score' },
  { mode: 'score-asc', label: 'Lowest score' },
  { mode: 'avg-desc', label: 'Highest average' },
]

function formatPlayerName(firstName: string, lastNameInitial: string | null) {
  if (!lastNameInitial) return firstName
  if (lastNameInitial.length === 1) return `${firstName} ${lastNameInitial}.`
  return `${firstName} ${lastNameInitial}`
}

function scoreColor(score: number) {
  if (score >= 8) return 'text-green-600'
  if (score >= 6) return 'text-orange-500'
  return 'text-red-500'
}

// Fixed-size rank badge so medal rows and numbered rows stay aligned.
function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const tint =
      rank === 1
        ? 'bg-amber-100'
        : rank === 2
          ? 'bg-gray-100'
          : 'bg-orange-100'
    return (
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-base ${tint}`}>
        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
      </span>
    )
  }
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-gray-400 tabular-nums">
      {rank}
    </span>
  )
}

// Player name links to the analyses detail page. `context` picks the routes:
// 'team' for the coach dashboard, 'org' for the organization dashboard.
function detailHref(entry: LeaderboardRow, context: 'team' | 'org'): string | null {
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
// Team column.
export default function LeaderboardTable({
  entries,
  context = 'team',
  showTeam = false,
}: {
  entries: LeaderboardRow[]
  context?: 'team' | 'org'
  showTeam?: boolean
}) {
  const [sortMode, setSortMode] = useState<SortMode>('score-desc')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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
            className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-black border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            Sort by: <span className="text-black">{currentLabel}</span>
            <span className={`text-gray-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-40 w-44 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden py-1">
              {sortOptions.map((opt) => (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => {
                    setSortMode(opt.mode)
                    setMenuOpen(false)
                  }}
                  className={`block w-full text-left px-4 py-2 text-sm transition-colors hover:bg-orange-50 ${
                    opt.mode === sortMode ? 'font-bold text-orange-600' : 'text-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="pl-4 pr-2 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">Rank</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Player</th>
                {showTeam && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Team</th>
                )}
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Best</th>
                {hasAvg && (
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg</th>
                )}
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Uploads</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedEntries.map((entry) => {
                const score = Number(entry.best_score)
                const avg = entry.avg_score != null ? Number(entry.avg_score) : null
                const name = formatPlayerName(entry.first_name, entry.last_name_initial)
                const href = detailHref(entry, context)
                const key = rowKey(entry)
                const rank = rankByKey[key]
                return (
                  <tr
                    key={key}
                    className={`transition-colors ${rank === 1 ? 'bg-orange-50/50 hover:bg-orange-50' : 'bg-white hover:bg-gray-50'}`}
                  >
                    <td className="pl-4 pr-2 py-2.5">
                      <RankBadge rank={rank} />
                    </td>
                    <td className="px-4 py-2.5 font-semibold whitespace-nowrap">
                      {href ? (
                        <Link href={href} className="text-black hover:text-orange-600 hover:underline transition-colors">
                          {name}
                        </Link>
                      ) : (
                        <span className="text-black">{name}</span>
                      )}
                    </td>
                    {showTeam && (
                      <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap">{entry.team_name ?? '—'}</td>
                    )}
                    <td className={`px-4 py-2.5 text-right font-black tabular-nums ${scoreColor(score)}`}>
                      {score.toFixed(1)}
                    </td>
                    {hasAvg && (
                      <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-500 tabular-nums">
                        {avg != null ? avg.toFixed(1) : '—'}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-right text-sm text-gray-400 tabular-nums">
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
