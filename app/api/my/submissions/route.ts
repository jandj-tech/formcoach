import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getTeamSessionFromRequest, provenSelfUploadEmail } from '@/lib/team-auth'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'

// The iOS app's Home feed: the caller's own completed analyses, newest first.
// Players get their submissions; a coach or org login gets the coach-self
// shots it analyzed in the app (stored with their admin email and no user_id).
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  const teamSession = session ? null : await getTeamSessionFromRequest(req)
  const orgSession = session || teamSession ? null : await getOrgSessionFromRequest(req)
  if (!session && !teamSession && !orgSession) {
    return NextResponse.json({ error: 'Login required' }, { status: 401 })
  }

  try {
    let rows: Array<{
      id: string
      token: string
      created_at: string
      overall_score: number | string | null
      frame_urls: string[] | null
    }>

    if (session) {
      rows = (await db`
        SELECT s.id, s.token, s.created_at, a.overall_score, a.frame_urls
        FROM submissions s
        JOIN analyses a ON a.submission_id = s.id
        -- user_id only: an email match is not ownership (security audit
        -- item 1). Legacy anonymous shots were given a user_id at signup and
        -- by the one-time backfill (migrate-email-list-legacy-sub.sql).
        WHERE s.user_id = ${session.userId}
          AND s.status = 'complete'
        ORDER BY s.created_at DESC
        LIMIT 50
      `) as unknown as typeof rows
    } else {
      // Self-uploads are keyed by email alone, so the email has to be PROVEN
      // for this session: an org login is, but a team session is only when
      // its row holds that email's one credential (provenSelfUploadEmail —
      // a legacy self-registered team that copied a coach's address must not
      // list that coach's shots). Unproven → an empty feed, not an error.
      const adminEmail = teamSession
        ? await provenSelfUploadEmail(teamSession, await getOrgSessionFromRequest(req))
        : orgSession!.adminEmail.toLowerCase()
      if (!adminEmail) return NextResponse.json({ submissions: [] })
      rows = (await db`
        SELECT s.id, s.token, s.created_at, a.overall_score, a.frame_urls
        FROM submissions s
        JOIN analyses a ON a.submission_id = s.id
        WHERE s.user_id IS NULL AND s.team_player_id IS NULL
          AND LOWER(s.email) = ${adminEmail}
          AND s.status = 'complete'
        ORDER BY s.created_at DESC
        LIMIT 50
      `) as unknown as typeof rows
    }

    const submissions = rows.map(r => {
      const frames = Array.isArray(r.frame_urls) ? r.frame_urls : []
      return {
        id: r.id,
        token: r.token,
        createdAt: r.created_at,
        overallScore: r.overall_score === null ? null : Number(r.overall_score),
        // Middle frame is usually near the release — the best thumbnail.
        thumbnail: frames.length > 0 ? frames[Math.floor(frames.length / 2)] : null,
      }
    })

    return NextResponse.json({ submissions })
  } catch (err) {
    console.error('[my/submissions] query failed:', err)
    return NextResponse.json({ error: 'Could not load your shots' }, { status: 500 })
  }
}
