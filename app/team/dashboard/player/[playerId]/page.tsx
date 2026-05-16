import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getTeamSession } from '@/lib/team-auth'
import { db } from '@/lib/db'
import TopNav from '@/components/TopNav'

// Coach/team-admin view of a single player's analyzed shots and scores.
export default async function TeamPlayerPage({ params }: { params: Promise<{ playerId: string }> }) {
  const session = await getTeamSession()
  if (!session) redirect('/team/login')

  const { playerId } = await params

  const [player] = (await db`
    SELECT id, first_name, last_name_initial
    FROM team_players
    WHERE id = ${playerId} AND team_id = ${session.teamId}
  `) as unknown as [{ id: string; first_name: string; last_name_initial: string | null } | undefined]

  if (!player) return notFound()

  const shots = (await db`
    SELECT s.id, s.token, s.created_at, a.overall_score
    FROM submissions s
    LEFT JOIN analyses a ON a.submission_id = s.id
    WHERE s.team_player_id = ${playerId} AND s.team_id = ${session.teamId}
    ORDER BY s.created_at DESC
  `) as unknown as Array<{
    id: string
    token: string
    created_at: string
    overall_score: string | number | null
  }>

  function scoreColor(score: number) {
    if (score >= 8) return 'text-green-600'
    if (score >= 6) return 'text-orange-500'
    return 'text-red-500'
  }

  const playerName = `${player.first_name}${player.last_name_initial ? ` ${player.last_name_initial}.` : ''}`

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <div className="max-w-3xl mx-auto w-full px-6 py-10 space-y-6">
        <Link href="/team/dashboard" className="text-sm text-orange-500 hover:underline">
          ← Back to team dashboard
        </Link>

        <div>
          <h1 className="text-2xl font-black text-black">{playerName}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {shots.length} shot{shots.length !== 1 ? 's' : ''} analyzed
          </p>
        </div>

        {shots.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
            <p className="font-semibold">No shots analyzed yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shots.map((shot) => {
              const score = shot.overall_score == null ? null : Number(shot.overall_score)
              const date = new Date(shot.created_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })
              return (
                <Link
                  key={shot.id}
                  href={`/results/${shot.token}`}
                  className="flex items-center gap-4 bg-gray-50 hover:bg-orange-50 border border-gray-200 hover:border-orange-200 rounded-xl p-4 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-500">{date}</p>
                    <p className="text-black font-semibold text-sm mt-0.5 group-hover:text-orange-600 transition-colors">
                      View Shot Breakdown →
                    </p>
                  </div>
                  {score !== null && !Number.isNaN(score) ? (
                    <div className={`text-2xl font-black shrink-0 ${scoreColor(score)}`}>
                      {score.toFixed(1)}
                    </div>
                  ) : (
                    <div className="text-gray-300 text-sm shrink-0">—</div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
