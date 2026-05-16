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

// Team leaderboard table. A player name links to the right detail page —
// the member page for account players, the player page for coach-added ones.
export default function LeaderboardTable({ entries }: { entries: LeaderboardRow[] }) {
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
            return (
              <tr key={entry.id} className={i === 0 ? 'bg-orange-50/50' : 'bg-white'}>
                <td className="px-4 py-3 text-sm font-bold text-gray-400">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </td>
                <td className="px-4 py-3 font-semibold">
                  <Link
                    href={entry.kind === 'member'
                      ? `/team/dashboard/member/${entry.id}`
                      : `/team/dashboard/player/${entry.id}`}
                    className="text-black hover:text-orange-600 hover:underline transition-colors"
                  >
                    {formatPlayerName(entry.first_name, entry.last_name_initial)}
                  </Link>
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
