import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'
import { playerTeamBoard } from '@/lib/team-shots'

function displayName(first: string, lastInitial: string): string {
  const f = (first || '').trim()
  const l = (lastInitial || '').trim()
  if (!l) return f
  return l.length === 1 ? `${f} ${l}.` : `${f} ${l}`
}

// The iOS app's Team tab: the player's teams with roster, leaderboard, and
// most-improved list. The app keeps the leaderboard behind a tap.
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 })

  try {
    const memberTeams = (await db`
      SELECT t.id, t.name, t.admin_email
      FROM team_memberships tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = ${session.userId}
      ORDER BY tm.joined_at DESC
    `) as unknown as Array<{ id: string; name: string; admin_email: string }>

    // Only teams this account is a MEMBER of. It used to add every team whose
    // head coach or team_coaches email equalled the account's email, with
    // role 'coach' — but a player account proves nothing about that address
    // (public signup has no email verification), so signing up with a
    // coach's email showed that team's leaderboard and unlocked coach powers
    // in the app. Real coaches sign into the app with a coach credential
    // (password or verified Google/Apple → a team token, see
    // lib/oauth-account.ts), and their app never calls this route: it uses
    // /api/team/coach-overview. The 'coach' role stays in the response type
    // for older app builds; it is simply no longer produced.
    const teams = memberTeams.map(t => ({ ...t, role: 'player' as 'player' | 'coach' }))

    const result = []
    for (const team of teams) {
      try {
      // Only shots filed to this team, each counted once — the same rows the
      // coach dashboard shows (lib/team-shots.ts). A teammate's personal or
      // other-team shots are not this team's business. When the coach hides
      // the leaderboard, playerTeamBoard keeps only this player's own row, so
      // teammates' scores never leave the server. Older app builds ignore
      // leaderboardHidden and simply draw a one-row board.
      const board = await playerTeamBoard(team.id, session.userId)
      const leaderboard = board.leaderboard
      const improved = board.mostImproved

      // Schedule glance: next upcoming event + how many events still need
      // this caller's RSVP. Wrapped separately — the schedule tables may not
      // exist yet on older databases.
      let nextEvent: {
        id: string; type: string; startsAt: string; timeTbd: boolean
        location: string; status: string
      } | null = null
      let pendingRsvpCount = 0
      try {
        const [ev] = (await db`
          SELECT id, type, starts_at, time_tbd, location, status
          FROM team_events
          WHERE team_id = ${team.id}
            AND status = 'active'
            AND starts_at >= NOW() - interval '3 hours'
          ORDER BY starts_at ASC
          LIMIT 1
        `) as unknown as [{
          id: string; type: string; starts_at: string | Date; time_tbd: boolean
          location: string; status: string
        } | undefined]
        if (ev) {
          nextEvent = {
            id: ev.id,
            type: ev.type,
            startsAt: new Date(ev.starts_at).toISOString(),
            timeTbd: ev.time_tbd,
            location: ev.location,
            status: ev.status,
          }
        }
        if (team.role === 'player') {
          const [pending] = (await db`
            SELECT COUNT(*)::int AS n
            FROM team_events e
            WHERE e.team_id = ${team.id}
              AND e.status = 'active'
              AND e.starts_at >= NOW()
              AND NOT EXISTS (
                SELECT 1 FROM team_event_rsvps r
                WHERE r.event_id = e.id AND r.user_id = ${session.userId}
              )
          `) as unknown as [{ n: number }]
          pendingRsvpCount = Number(pending?.n ?? 0)
        }
      } catch {}

      // Roster: names only — the app shows the roster without any scores.
      // Never fall back to the email: every teammate can see this list.
      const roster = (await db`
        SELECT COALESCE(NULLIF(tm.first_name, ''), NULLIF(u.nickname, ''), 'Player') AS first_name,
               COALESCE(tm.last_name_initial, '') AS last_name_initial
        FROM team_memberships tm
        JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = ${team.id}
        ORDER BY tm.first_name ASC NULLS LAST
      `) as unknown as Array<{ first_name: string; last_name_initial: string }>

      result.push({
        id: team.id,
        name: team.name,
        role: team.role,
        nextEvent,
        pendingRsvpCount,
        memberCount: roster.length,
        roster: roster.map(r => displayName(r.first_name, r.last_name_initial)),
        leaderboardHidden: board.hidden,
        leaderboard: leaderboard.map(e => ({
          name: displayName(e.first_name, e.last_name_initial),
          bestScore: Number(e.best_score),
          avgScore: e.avg_score != null ? Number(e.avg_score) : null,
          uploads: e.upload_count,
        })),
        mostImproved: improved
          .map(e => ({
            name: displayName(e.first_name, e.last_name_initial),
            firstScore: Number(e.first_score),
            latestScore: Number(e.latest_score),
          }))
          .filter(e => e.latestScore > e.firstScore)
          .slice(0, 5),
      })
      } catch (err) {
        // One team's data problem must not blank the whole tab — degrade to
        // an empty card so the user still sees their team.
        console.error('[team/summary] team block failed:', team.id, err)
        result.push({
          id: team.id, name: team.name, role: team.role,
          nextEvent: null, pendingRsvpCount: 0,
          memberCount: 0, roster: [], leaderboardHidden: false, leaderboard: [], mostImproved: [],
        })
      }
    }

    return NextResponse.json({ teams: result })
  } catch (err) {
    console.error('[team/summary] query failed:', err)
    return NextResponse.json({ error: 'Could not load your team' }, { status: 500 })
  }
}
