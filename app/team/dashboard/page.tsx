import { redirect } from 'next/navigation'
import { getTeamSession } from '@/lib/team-auth'
import { db } from '@/lib/db'
import TopNav from '@/components/TopNav'
import TeamDashboardClient from './TeamDashboardClient'

export default async function TeamDashboardPage() {
  const session = await getTeamSession()
  if (!session) redirect('/login')

  const [team] = await db`
    SELECT id, name, access_code, admin_email, credits
    FROM teams WHERE id = ${session.teamId}
  ` as unknown as [{ id: string; name: string; access_code: string; admin_email: string; credits: number } | undefined]

  if (!team) redirect('/login')

  const allTeams = await db`
    SELECT id, name FROM teams WHERE admin_email = ${session.adminEmail} AND password_hash IS NOT NULL ORDER BY name ASC
  ` as unknown as Array<{ id: string; name: string }>

  let leaderboard: Array<{
    id: string
    first_name: string
    last_name_initial: string
    best_score: number
    upload_count: number
  }> = []

  let improved: Array<{
    player_id: string
    first_name: string
    last_name_initial: string
    first_score: number
    latest_score: number
  }> = []

  let members: Array<{ id: string; email: string; tokens: number; first_name: string | null; last_name_initial: string | null }> = []
  let pendingMembers: Array<{ id: string; first_name: string; last_name_initial: string | null; invite_token: string | null }> = []
  let coaches: Array<{ id: string; email: string; pending: boolean; nickname: string | null }> = []
  let headCoachNickname: string | null = null
  let teamInitiated = false
  let teamTokenPool = 0

  try {
    // Shots come from two sources: players who joined with an account
    // (submissions.user_id) and players a coach uploaded for by name
    // (submissions.team_player_id). The leaderboard combines both.
    leaderboard = (await db`
      WITH shots AS (
        SELECT
          u.id::text AS player_id,
          COALESCE(NULLIF(tm.first_name, ''), u.email) AS first_name,
          COALESCE(tm.last_name_initial, '') AS last_name_initial,
          a.overall_score, s.id AS sid
        FROM team_memberships tm
        JOIN users u ON u.id = tm.user_id
        JOIN submissions s ON s.user_id = u.id
        JOIN analyses a ON a.submission_id = s.id
        WHERE tm.team_id = ${team.id} AND s.status = 'complete'
        UNION ALL
        SELECT
          tp.id::text AS player_id, tp.first_name, tp.last_name_initial,
          a.overall_score, s.id AS sid
        FROM team_players tp
        JOIN submissions s ON s.team_player_id = tp.id AND s.team_id = tp.team_id
        JOIN analyses a ON a.submission_id = s.id
        WHERE tp.team_id = ${team.id} AND s.status = 'complete'
      )
      SELECT
        player_id AS id, first_name, last_name_initial,
        MAX(overall_score) AS best_score,
        COUNT(sid)::int AS upload_count
      FROM shots
      GROUP BY player_id, first_name, last_name_initial
      ORDER BY best_score DESC
    `) as unknown as typeof leaderboard

    improved = (await db`
      WITH shots AS (
        SELECT
          u.id::text AS player_id,
          COALESCE(NULLIF(tm.first_name, ''), u.email) AS first_name,
          COALESCE(tm.last_name_initial, '') AS last_name_initial,
          a.overall_score, s.id AS sid, s.created_at
        FROM team_memberships tm
        JOIN users u ON u.id = tm.user_id
        JOIN submissions s ON s.user_id = u.id
        JOIN analyses a ON a.submission_id = s.id
        WHERE tm.team_id = ${team.id} AND s.status = 'complete'
        UNION ALL
        SELECT
          tp.id::text AS player_id, tp.first_name, tp.last_name_initial,
          a.overall_score, s.id AS sid, s.created_at
        FROM team_players tp
        JOIN submissions s ON s.team_player_id = tp.id AND s.team_id = tp.team_id
        JOIN analyses a ON a.submission_id = s.id
        WHERE tp.team_id = ${team.id} AND s.status = 'complete'
      ),
      ranked AS (
        SELECT
          player_id, first_name, last_name_initial, overall_score, created_at,
          COUNT(sid) OVER (PARTITION BY player_id) AS upload_count,
          ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY created_at ASC) AS rn_first,
          ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY created_at DESC) AS rn_last
        FROM shots
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
    `) as unknown as typeof improved
  } catch (err) {
    console.error('[team/dashboard] leaderboard query failed:', err)
  }

  try {
    members = (await db`
      SELECT u.id, u.email, COALESCE(u.analysis_tokens, 0)::int AS tokens,
        tm.first_name, tm.last_name_initial
      FROM team_memberships tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ${team.id}
      ORDER BY tm.first_name ASC NULLS LAST, u.email ASC
    `) as unknown as typeof members
  } catch (err) {
    console.error('[team/dashboard] members query failed:', err)
  }

  try {
    pendingMembers = (await db`
      SELECT id, first_name, last_name_initial, invite_token
      FROM pending_team_members
      WHERE team_id = ${team.id}
      ORDER BY created_at ASC
    `) as unknown as typeof pendingMembers
  } catch (err) {
    console.error('[team/dashboard] pending members query failed:', err)
  }

  try {
    coaches = (await db`
      SELECT id, email, nickname, (password_hash IS NULL) AS pending
      FROM team_coaches
      WHERE team_id = ${team.id}
      ORDER BY created_at ASC
    `) as unknown as typeof coaches
  } catch (err) {
    console.error('[team/dashboard] coaches query failed:', err)
  }

  // Head coach's display name — queried separately so a missing column
  // (pre-migration) can't break the whole dashboard.
  try {
    const [row] = (await db`
      SELECT coach_nickname,
             COALESCE(token_pool, 0)::int AS token_pool,
             (initiated_at IS NOT NULL) AS initiated
      FROM teams WHERE id = ${team.id}
    `) as unknown as [{ coach_nickname: string | null; token_pool: number; initiated: boolean } | undefined]
    headCoachNickname = row?.coach_nickname ?? null
    teamTokenPool = row?.token_pool ?? 0
    teamInitiated = row?.initiated ?? false
  } catch (err) {
    console.error('[team/dashboard] team meta query failed:', err)
  }

  // The display name of whichever coach is currently logged in.
  const myNickname =
    session.adminEmail === team.admin_email
      ? headCoachNickname
      : (coaches.find(c => c.email === session.adminEmail)?.nickname ?? null)

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <TeamDashboardClient
        team={{ id: team.id, name: team.name, accessCode: team.access_code, credits: team.credits, initiated: teamInitiated, tokenPool: teamTokenPool }}
        leaderboard={leaderboard}
        improved={improved}
        members={members}
        pendingMembers={pendingMembers}
        coaches={coaches}
        foundingCoachEmail={team.admin_email}
        foundingCoachNickname={headCoachNickname}
        myNickname={myNickname}
        allTeams={allTeams}
        currentTeamId={team.id}
        adminEmail={session.adminEmail}
      />
    </main>
  )
}
