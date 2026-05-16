import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import TopNav from '@/components/TopNav'

type LeaderboardEntry = {
  id: string
  first_name: string
  last_name_initial: string
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

export default async function TeamLeaderboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // The team this player has joined (most recent membership).
  let team: { id: string; name: string } | null = null
  try {
    const [row] = (await db`
      SELECT t.id, t.name
      FROM team_memberships tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = ${session.userId}
      ORDER BY tm.joined_at DESC
      LIMIT 1
    `) as unknown as [{ id: string; name: string } | undefined]
    team = row ?? null
  } catch (err) {
    console.error('[dashboard/leaderboard] team query failed:', err)
  }

  // Not on a team — nothing to rank, send them back to the dashboard.
  if (!team) redirect('/dashboard')

  let leaderboard: LeaderboardEntry[] = []
  try {
    leaderboard = (await db`
      SELECT tp.id, tp.first_name, tp.last_name_initial,
        MAX(a.overall_score) AS best_score,
        COUNT(s.id)::int AS upload_count
      FROM team_players tp
      JOIN submissions s ON s.team_player_id = tp.id AND s.team_id = tp.team_id
      JOIN analyses a ON a.submission_id = s.id
      WHERE tp.team_id = ${team.id} AND s.status = 'complete'
      GROUP BY tp.id, tp.first_name, tp.last_name_initial
      ORDER BY best_score DESC
    `) as unknown as LeaderboardEntry[]
  } catch (err) {
    console.error('[dashboard/leaderboard] leaderboard query failed:', err)
  }

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <div className="max-w-3xl mx-auto w-full px-6 py-10 space-y-6">
        <div>
          <Link href="/dashboard" className="text-sm text-orange-500 hover:underline font-medium">
            ← Back to dashboard
          </Link>
          <h1 className="text-2xl font-black text-black mt-2">{team.name} Leaderboard</h1>
          <p className="text-gray-500 text-sm mt-1">Best shot score for each player on your team</p>
        </div>

        {leaderboard.length === 0 ? (
          <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
            <p className="font-semibold">No shots analyzed yet</p>
            <p className="text-sm mt-1">Scores show up here once teammates analyze their shots.</p>
          </div>
        ) : (
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
                {leaderboard.map((entry, i) => {
                  const score = Number(entry.best_score)
                  return (
                    <tr key={entry.id} className={i === 0 ? 'bg-orange-50/50' : 'bg-white'}>
                      <td className="px-4 py-3 text-sm font-bold text-gray-400">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </td>
                      <td className="px-4 py-3 font-semibold text-black">
                        {formatPlayerName(entry.first_name, entry.last_name_initial)}
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
        )}
      </div>
    </main>
  )
}
