import Link from 'next/link'

export interface LeaderboardRow {
  id: string
  first_name: string
  last_name_initial: string
  kind: 'member' | 'player'
  best_score: number | string
  upload_count: number
}

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

// Team leaderboard table.
export default function LeaderboardTable({
  entries,
  context = 'team',
}: {
  entries: LeaderboardRow[]
  context?: 'team' | 'org'
}) {
  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Rank</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Player</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Best Score</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Uploads</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {entries.map((entry, i) => {
            const score = Number(entry.best_score)
            const name = formatPlayerName(entry.first_name, entry.last_name_initial)
            const href = detailHref(entry, context)
            return (
              <tr key={entry.id} className={i === 0 ? 'bg-orange-50/50' : 'bg-white'}>
                <td className="px-4 py-3 text-sm font-bold text-gray-400">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
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
  )
}
