import { redirect } from 'next/navigation'
import { getTeamSession } from '@/lib/team-auth'
import { db } from '@/lib/db'
import TopNav from '@/components/TopNav'
import TeamDashboardClient from './TeamDashboardClient'

export default async function TeamDashboardPage() {
  const session = await getTeamSession()
  if (!session) redirect('/team/login')

  const [team] = await db`
    SELECT id, name, access_code, credits
    FROM teams WHERE id = ${session.teamId}
  ` as unknown as [{ id: string; name: string; access_code: string; credits: number } | undefined]

  if (!team) redirect('/team/login')

  const leaderboard = await db`
    SELECT tp.id, tp.first_name, tp.last_name_initial,
      MAX(a.overall_score) AS best_score,
      COUNT(s.id)::int AS upload_count
    FROM team_players tp
    JOIN submissions s ON s.team_player_id = tp.id AND s.team_id = tp.team_id
    JOIN analyses a ON a.submission_id = s.id
    WHERE tp.team_id = ${team.id} AND s.status = 'complete'
    GROUP BY tp.id, tp.first_name, tp.last_name_initial
    ORDER BY best_score DESC
  ` as unknown as Array<{
    id: string
    first_name: string
    last_name_initial: string
    best_score: number
    upload_count: number
  }>

  const improved = await db`
    WITH ranked AS (
      SELECT
        tp.id AS player_id,
        tp.first_name,
        tp.last_name_initial,
        a.overall_score,
        s.created_at,
        COUNT(s.id) OVER (PARTITION BY tp.id) AS upload_count,
        ROW_NUMBER() OVER (PARTITION BY tp.id ORDER BY s.created_at ASC) AS rn_first,
        ROW_NUMBER() OVER (PARTITION BY tp.id ORDER BY s.created_at DESC) AS rn_last
      FROM team_players tp
      JOIN submissions s ON s.team_player_id = tp.id AND s.team_id = tp.team_id
      JOIN analyses a ON a.submission_id = s.id
      WHERE tp.team_id = ${team.id} AND s.status = 'complete'
    )
    SELECT DISTINCT
      player_id,
      first_name,
      last_name_initial,
      MAX(CASE WHEN rn_first = 1 THEN overall_score END) OVER (PARTITION BY player_id) AS first_score,
      MAX(CASE WHEN rn_last = 1 THEN overall_score END) OVER (PARTITION BY player_id) AS latest_score
    FROM ranked
    WHERE upload_count >= 2
    ORDER BY (latest_score - first_score) DESC
  ` as unknown as Array<{
    player_id: string
    first_name: string
    last_name_initial: string
    first_score: number
    latest_score: number
  }>

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <TeamDashboardClient
        team={{ id: team.id, name: team.name, accessCode: team.access_code, credits: team.credits }}
        leaderboard={leaderboard}
        improved={improved}
      />
    </main>
  )
}
