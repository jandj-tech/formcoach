import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'

// Lists the org's teams — used by the cart so an org can pick which team's
// pool receives the free analyses from a ball purchase, and by the mobile
// app's org Team tab. `accessCode` (the join code behind
// learnhoops.com/join/<code>) and `ageGroup` are included so the app does not
// need one /api/team/coach-overview call per team just to show invite codes.
//
// `coaches` (per team, and once more org-wide at the top level) powers the
// app's "give tokens to a coach" picker, so the org picks a coach instead of
// typing an email. A coach is a team's head coach (the teams row) or an
// assistant (team_coaches), on THIS org's teams only. The org admin's own
// email is left out — a self-coached team's seat is the org itself, not a
// coach. Coaches who haven't accepted their invite yet are listed with
// `accepted: false`, matching the web org Tokens panel: tokens given to them
// sit in coach_credits under their email until they finish setup.
//
// Additive: older clients read only id + name (+ accessCode/ageGroup).
// `leaderboardVisibility` backs the org card's "Players can see the team
// leaderboard" switch (POST /api/team/leaderboard-visibility).

type Role = 'head' | 'assistant'

interface TeamCoach {
  email: string
  name: string
  role: Role
  accepted: boolean
  tokens: number
}

interface OrgCoach {
  email: string
  name: string
  accepted: boolean
  tokens: number
  teams: Array<{ id: string; name: string; role: Role }>
}

/** "sam.okafor@coaches.test" → "Sam Okafor" — a coach login often has no nickname. */
function nameFromEmail(email: string): string {
  const local = email.split('@')[0]?.trim() ?? ''
  const words = local
    .split(/[._\-+]+/)
    .map((w) => w.replace(/\d+/g, ''))
    .filter(Boolean)
  if (words.length === 0) return local || email
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

export async function GET(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let teams: Array<{
    id: string; name: string; access_code: string | null; age_group: string | null
    leaderboard_visibility: string | null
  }>
  try {
    teams = (await db`
      SELECT id, name, access_code, age_group, leaderboard_visibility FROM teams
      WHERE organization_id = ${session.orgId}
      ORDER BY created_at ASC
    `) as unknown as typeof teams
  } catch (err) {
    console.error('Org teams list error:', err)
    return NextResponse.json({ error: 'Could not load teams' }, { status: 500 })
  }

  // Coaches are best-effort: if this lookup fails the team list still loads
  // and the app falls back to typing the coach's email.
  const perTeam = new Map<string, TeamCoach[]>()
  const orgWide = new Map<string, OrgCoach>()
  let coachesLoaded = false
  try {
    const rows = (await db`
      WITH org AS (
        SELECT LOWER(admin_email) AS email FROM organizations WHERE id = ${session.orgId}
      ),
      seats AS (
        SELECT t.id AS team_id, t.name AS team_name, t.created_at AS team_created,
               LOWER(TRIM(t.admin_email)) AS email, t.coach_nickname AS nickname,
               'head' AS role, (t.password_hash IS NOT NULL) AS accepted,
               0 AS role_order, t.created_at AS seat_created
        FROM teams t
        WHERE t.organization_id = ${session.orgId}
        UNION ALL
        SELECT t.id, t.name, t.created_at,
               LOWER(TRIM(tc.email)), tc.nickname,
               'assistant', (tc.password_hash IS NOT NULL),
               1, tc.created_at
        FROM team_coaches tc
        JOIN teams t ON t.id = tc.team_id
        WHERE t.organization_id = ${session.orgId}
      )
      SELECT s.team_id, s.team_name, s.email, s.nickname, s.role, s.accepted,
             COALESCE(cc.credits, 0)::int AS tokens
      FROM seats s
      LEFT JOIN coach_credits cc ON LOWER(cc.email) = s.email
      WHERE s.email <> '' AND s.email <> (SELECT email FROM org)
      ORDER BY s.team_created ASC, s.role_order ASC, s.seat_created ASC
    `) as unknown as Array<{
      team_id: string; team_name: string; email: string; nickname: string | null
      role: Role; accepted: boolean; tokens: number
    }>

    for (const r of rows) {
      const nick = r.nickname?.trim() || null
      const list = perTeam.get(r.team_id) ?? []
      // One entry per coach per team (a head who is also listed as an
      // assistant on the same team shows once, as head — rows come head-first).
      if (!list.some((c) => c.email === r.email)) {
        list.push({ email: r.email, name: nick ?? nameFromEmail(r.email), role: r.role, accepted: r.accepted, tokens: r.tokens })
        perTeam.set(r.team_id, list)
      }

      const existing = orgWide.get(r.email)
      if (!existing) {
        orgWide.set(r.email, {
          email: r.email,
          name: nick ?? nameFromEmail(r.email),
          accepted: r.accepted,
          tokens: r.tokens,
          teams: [{ id: r.team_id, name: r.team_name, role: r.role }],
        })
      } else {
        // First nickname seen wins; accepted on any seat means they can log in.
        if (nick && existing.name === nameFromEmail(r.email)) existing.name = nick
        existing.accepted = existing.accepted || r.accepted
        if (!existing.teams.some((t) => t.id === r.team_id)) {
          existing.teams.push({ id: r.team_id, name: r.team_name, role: r.role })
        }
      }
    }
    coachesLoaded = true
  } catch (err) {
    console.error('Org teams coach lookup error:', err)
  }

  const coaches = [...orgWide.values()].sort(
    (a, b) => Number(b.accepted) - Number(a.accepted) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  return NextResponse.json({
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      accessCode: t.access_code,
      ageGroup: t.age_group,
      // 'team' = players see the ranked board; 'hidden' = only their own row.
      leaderboardVisibility: t.leaderboard_visibility === 'hidden' ? 'hidden' : 'team',
      ...(coachesLoaded ? { coaches: perTeam.get(t.id) ?? [] } : {}),
    })),
    ...(coachesLoaded ? { coaches } : {}),
  })
}
