import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { db } from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamCode: string }> }
) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { teamCode } = await params

  const [team] = await db`
    SELECT id FROM teams WHERE id = ${session.teamId} AND access_code = ${teamCode.toUpperCase()}
  ` as unknown as [{ id: string } | undefined]

  if (!team) {
    return NextResponse.json({ error: 'Team not found or access denied' }, { status: 404 })
  }

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

  // Most improved: players with 2+ uploads, compare earliest vs latest score
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

  return NextResponse.json({ leaderboard, improved })
}
