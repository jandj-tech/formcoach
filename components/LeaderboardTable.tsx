'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

export interface LeaderboardRow {
  id: string
  first_name: string
  last_name_initial: string
  kind: 'member' | 'player'
  best_score: number | string
  upload_count: number
  // Set for the organization-wide list, so the player's team can be shown.
  team_name?: string
}

type SortMode = 'score-desc' | 'score-asc' | 'name'

const SORT_OPTIONS: { mode: SortMode; label: string }[] = [
  { mode: 'name', label: 'Name (A–Z)' },
  { mode: 'score-desc', label: 'Highest score' },
  { mode: 'score-asc', label: 'Lowest score' },
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
// score is the highest score recorded on their account; their Rank always
// reflects that score standing, no matter which sort order is shown.
// Pass `showTeam` for the org-wide list to add a Team column.
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
    } else {
      copy.sort((a, b) => Number(b.best_score) - Number(a.best_score))
    }
    return copy
  }, [entries, sortMode])

  const currentLabel = SORT_OPTIONS.find((o) => o.mode === sortMode)!.label

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
            <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden py-1">
              {SORT_OPTIONS.map((opt) => (
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

      <div className="border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Rank</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Player</th>
              {showTeam && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Team</th>
              )}
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Best Score</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Uploads</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedEntries.map((entry) => {
              const score = Number(entry.best_score)
              const name = formatPlayerName(entry.first_name, entry.last_name_initial)
              const href = detailHref(entry, context)
              const key = rowKey(entry)
              const rank = rankByKey[key]
              return (
                <tr key={key} className={rank === 1 ? 'bg-orange-50/50' : 'bg-white'}>
                  <td className="px-4 py-3 text-sm font-bold text-gray-400">
                    {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {href ? (
                      <Link href={href} className="text-black hover:text-orange-600 hover:underline transition-colors">
                        {name}
                      </Link>
                    ) : (
                      <span className="text-black">{name}</span>
                    )}
                  </td>
                  {showTeam && (
                    <td className="px-4 py-3 text-sm text-gray-600">{entry.team_name ?? '—'}</td>
                  )}
                  <td className={`px-4 py-3 text-right font-black text-lg ${scoreColor(score)}`}>
                    {score.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-400">
                    {entry.upload_count}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
