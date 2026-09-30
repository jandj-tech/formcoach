import { redirect } from 'next/navigation'
import { getTeamSession, provenCoachCreditsEmail, switchableTeams } from '@/lib/team-auth'
import { teamLeaderboard, teamMostImproved } from '@/lib/team-shots'
import { getOrgSession } from '@/lib/org-auth'
import { db } from '@/lib/db'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import TeamDashboardClient from './TeamDashboardClient'
import type { ClassManagerPackage } from '@/components/ClassManager'
import { teamTier } from '@/lib/team-features'
import { loadTeamRosterEntries, type TeamRosterEntry } from '@/lib/team-roster-refs'

export default async function TeamDashboardPage() {
  const session = await getTeamSession()
  if (!session) redirect('/login')

  const [team] = await db`
    SELECT id, name, access_code, admin_email, credits, organization_id
    FROM teams WHERE id = ${session.teamId}
  ` as unknown as [{ id: string; name: string; access_code: string; admin_email: string; credits: number; organization_id: string | null } | undefined]

  if (!team) redirect('/login')

  // True when an org owner is viewing one of their own organization's teams.
  const orgSession = await getOrgSession()
  const fromOrg = !!orgSession && !!team.organization_id && team.organization_id === orgSession.orgId

  // The team switcher: every team this email coaches — head coach, added
  // coach (team_coaches) or owning org's admin — narrowed to exactly what
  // /api/team/select will accept for THIS session (same credential, or a live
  // org session for org teams). Head-coach teams alone used to be listed,
  // so a coach who heads one team and assists on another never saw the other.
  const allTeams = await switchableTeams(session, orgSession)

  let leaderboard: Array<{
    id: string
    first_name: string
    last_name_initial: string
    kind: 'member' | 'player'
    best_score: number
    avg_score: number | string | null
    upload_count: number
  }> = []

  let improved: Array<{
    player_id: string
    first_name: string
    last_name_initial: string
    first_score: number
    latest_score: number
  }> = []

  let members: Array<{ id: string; email: string; tokens: number; first_name: string | null; last_name_initial: string | null; roster_pending?: boolean; club_plan?: string | null; club_ends_at?: string | null }> = []
  let pendingMembers: Array<{ id: string; first_name: string; last_name_initial: string | null; invite_token: string | null }> = []
  let coaches: Array<{ id: string; email: string; pending: boolean; nickname: string | null }> = []
  let headCoachNickname: string | null = null
  let teamTokenPool = 0

  try {
    // Only shots filed to THIS team — see lib/team-shots.ts.
    leaderboard = await teamLeaderboard(team.id) as unknown as typeof leaderboard
    improved = await teamMostImproved(team.id) as unknown as typeof improved
  } catch (err) {
    console.error('[team/dashboard] leaderboard query failed:', err)
  }

  try {
    members = (await db`
      SELECT u.id, u.email, COALESCE(u.analysis_tokens, 0)::int AS tokens,
        tm.first_name, tm.last_name_initial,
        COALESCE(u.roster_pending, false) AS roster_pending
      FROM team_memberships tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ${team.id}
      ORDER BY tm.first_name ASC NULLS LAST, u.email ASC
    `) as unknown as typeof members
  } catch (err) {
    console.error('[team/dashboard] members query failed:', err)
  }

  // Read-only "Club membership" badge: players holding a live seat from the
  // organization that owns this team. Separate query so a database without
  // the memberships migration still renders the roster.
  if (members.length > 0) {
    try {
      const covered = (await db`
        SELECT s.user_id, s.plan, s.ends_at
        FROM org_membership_seats s
        JOIN teams t ON t.id = ${team.id} AND t.organization_id = s.org_id
        WHERE s.status = 'assigned' AND s.ends_at > NOW()
          AND s.user_id IN (SELECT user_id FROM team_memberships WHERE team_id = ${team.id})
      `) as unknown as Array<{ user_id: string; plan: string; ends_at: string }>
      const byUser = new Map(covered.map(c => [c.user_id, c]))
      members = members.map(m => {
        const c = byUser.get(m.id)
        return c ? { ...m, club_plan: c.plan, club_ends_at: new Date(c.ends_at).toISOString() } : m
      })
    } catch {
      // org_membership_seats not migrated yet — no badges.
    }
  }

  try {
    pendingMembers = (await db`
      SELECT id, first_name, last_name_initial, invite_token, contact_email
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
  let classPackageId: string | null = null
  // Whether players see the whole leaderboard. Its own query so a database
  // without the column still renders the dashboard (defaults to shown).
  let leaderboardVisibility: 'team' | 'hidden' = 'team'
  try {
    const [row] = (await db`
      SELECT leaderboard_visibility FROM teams WHERE id = ${team.id}
    `) as unknown as [{ leaderboard_visibility: string | null } | undefined]
    if (row?.leaderboard_visibility === 'hidden') leaderboardVisibility = 'hidden'
  } catch (err) {
    console.error('[team/dashboard] leaderboard visibility query failed:', err)
  }
  try {
    const [row] = (await db`
      SELECT coach_nickname,
             COALESCE(token_pool, 0)::int AS token_pool,
             class_package_id
      FROM teams WHERE id = ${team.id}
    `) as unknown as [{ coach_nickname: string | null; token_pool: number; class_package_id: string | null } | undefined]
    headCoachNickname = row?.coach_nickname ?? null
    teamTokenPool = row?.token_pool ?? 0
    classPackageId = row?.class_package_id ?? null
  } catch (err) {
    console.error('[team/dashboard] team meta query failed:', err)
  }

  // The 10-Week Shooting Class this team is running, if any. The dashboard
  // used to fetch `class_package_id` and throw the answer away, so a coach
  // whose team was enrolled saw nothing about the program they were meant to
  // be delivering — no roster progress, no session plan, nothing.
  let classProgram: (ClassManagerPackage & { tokenPool: number }) | null = null
  if (classPackageId) {
    try {
      const [row] = (await db`
        SELECT p.id,
               p.player_count,
               p.status,
               p.created_at,
               COALESCE(p.token_pool, 0)::int AS token_pool
        FROM org_class_packages p
        WHERE p.id = ${classPackageId}
      `) as unknown as [{
        id: string; player_count: number; status: string
        created_at: string; token_pool: number
      } | undefined]

      if (row) {
        // The coach runs the roster week to week, so they get the same rows the
        // org sees — not just the counts.
        const enrollments = (await db`
          SELECT e.id, e.first_name, e.last_name_initial,
                 e.first_score, e.display_final_score,
                 (e.first_submission_id IS NOT NULL) AS has_first,
                 (e.final_submission_id IS NOT NULL) AS has_final
          FROM org_class_enrollments e
          WHERE e.package_id = ${row.id}
          ORDER BY e.created_at ASC
        `) as unknown as ClassManagerPackage['enrollments']

        classProgram = {
          id: row.id,
          player_count: row.player_count,
          status: row.status,
          created_at: row.created_at,
          team_access_code: team.access_code,
          enrollments,
          teamName: team.name,
          teamCredits: team.credits,
          tokenPool: row.token_pool,
        }
      }
    } catch (err) {
      console.error('[team/dashboard] class package query failed:', err)
    }
  }
  // Every roster row with its stable ref, for "Upload a shot for a player":
  // the same list the bulk uploader uses, so same-name players stay apart.
  let uploadRoster: TeamRosterEntry[] = []
  try {
    uploadRoster = await loadTeamRosterEntries(team.id)
  } catch (err) {
    console.error('[team/dashboard] upload roster query failed:', err)
  }

  // The coach's own shot uploads, shown as a list in "My Uploads".
  let myUploads: Array<{ id: string; token: string; created_at: string; overall_score: string | number | null }> = []
  try {
    myUploads = (await db`
      SELECT s.id, s.token, s.created_at, a.overall_score
      FROM submissions s
      LEFT JOIN analyses a ON a.submission_id = s.id
      WHERE s.email = ${session.adminEmail}
      ORDER BY s.created_at DESC
      LIMIT 50
    `) as unknown as typeof myUploads
  } catch (err) {
    console.error('[team/dashboard] my uploads query failed:', err)
  }

  // The organization this team belongs to (if any) — enables the coach's
  // "return credits to organization" flow.
  let orgName: string | null = null
  if (team.organization_id) {
    try {
      const [o] = (await db`
        SELECT name FROM organizations WHERE id = ${team.organization_id}
      `) as unknown as [{ name: string } | undefined]
      orgName = o?.name ?? null
    } catch (err) {
      console.error('[team/dashboard] org name query failed:', err)
    }
  }

  // The logged-in coach's own credit balance — only when this session proves
  // it holds that email (see provenCoachCreditsEmail); otherwise 0, matching
  // what the spend routes allow.
  let coachCredits = 0
  try {
    const proven = await provenCoachCreditsEmail(session, orgSession)
    const [cc] = proven
      ? ((await db`
          SELECT credits FROM coach_credits WHERE email = ${proven}
        `) as unknown as [{ credits: number } | undefined])
      : [undefined]
    coachCredits = cc?.credits ?? 0
  } catch (err) {
    console.error('[team/dashboard] coach credits query failed:', err)
  }

  // The display name of whichever coach is currently logged in.
  const myNickname =
    session.adminEmail === team.admin_email
      ? headCoachNickname
      : (coaches.find(c => c.email === session.adminEmail)?.nickname ?? null)

  return (
    <main className="min-h-screen bg-white dark:bg-ink-950 flex flex-col">
      <TopNav />
      <TeamDashboardClient
        team={{ id: team.id, name: team.name, accessCode: team.access_code, credits: team.credits, tokenPool: teamTokenPool, tier: await teamTier(team.id), leaderboardVisibility }}
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
        fromOrg={fromOrg}
        orgName={orgName}
        myUploads={myUploads}
        coachCredits={coachCredits}
        classProgram={classProgram}
        uploadRoster={uploadRoster}
      />
      <SiteFooter />
    </main>
  )
}
