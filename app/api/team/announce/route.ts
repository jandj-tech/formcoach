import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { rateLimit } from '@/lib/rate-limit'
import { coachSenderForTeam, orgSenderById, sendPlayerEmails, type PlayerEmailSender, type ResolvedRecipient } from '@/lib/player-email'

// Coach announcement blast: emails every registered player on the team.
// For urgent word ("practice is cancelled") typed by the coach verbatim.
// Kept for back-compat; the "Email players" composer (/api/player-email/*)
// is the current UI. Rendering, escaping, suppression, the on-behalf From
// and the send loop are shared with it.
export async function POST(req: NextRequest) {
  const p = (await req.json().catch(() => ({}))) as { teamId?: string; subject?: string; message?: string }
  const message = (p.message ?? '').toString().replace(/\r\n?/g, '\n').trim().slice(0, 5000)
  if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 })

  // Resolved independently: a stale team cookie for another team must not
  // shadow a valid org session that owns this team (and vice versa).
  const [teamSession, orgSession] = await Promise.all([
    getTeamSessionFromRequest(req),
    getOrgSessionFromRequest(req),
  ])
  if (!teamSession && !orgSession) return NextResponse.json({ error: 'Coach login required' }, { status: 401 })

  const teamId = (p.teamId ?? teamSession?.teamId ?? '').toString()
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })
  if (!/^[0-9a-f-]{36}$/i.test(teamId)) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  try {
    const [team] = (await db`
      SELECT id, name, admin_email, organization_id FROM teams WHERE id = ${teamId}
    `) as unknown as [{ id: string; name: string; admin_email: string; organization_id: string | null } | undefined]
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

    // Credit (and reply to) whoever actually sent it. A coach session on this
    // team wins; a head coach who owns several teams may announce to any of
    // them; otherwise an org session that owns the team sends as the org.
    let sender: PlayerEmailSender | null = null
    if (teamSession) {
      const sameTeam = teamSession.teamId === teamId
      const ownsTeam = teamSession.adminEmail.toLowerCase() === team.admin_email.toLowerCase()
      if (sameTeam || ownsTeam) sender = await coachSenderForTeam(teamId, teamSession.adminEmail)
    }
    if (!sender && orgSession && team.organization_id === orgSession.orgId) {
      sender = await orgSenderById(orgSession.orgId)
    }
    if (!sender) return NextResponse.json({ error: 'Not your team' }, { status: 403 })

    // A blast reaches the whole roster, so cap how often one team can fire it.
    // Fails open on limiter error.
    const limit = await rateLimit(`team-announce:${teamId}`, 6, 3600)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'You have sent several announcements recently. Please wait a little before sending another.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const players = (await db`
      SELECT DISTINCT ON (LOWER(u.email))
        LOWER(u.email) AS email, u.id AS user_id,
        COALESCE(NULLIF(TRIM(tm.first_name), ''), NULLIF(split_part(TRIM(u.nickname), ' ', 1), '')) AS first_name,
        COALESCE(NULLIF(TRIM(CONCAT(tm.first_name, ' ', NULLIF(TRIM(tm.last_name_initial), '') || '.')), ''), split_part(u.email, '@', 1)) AS name,
        el.unsubscribed_at, el.bounced_at, el.complained_at
      FROM team_memberships tm
      JOIN users u ON u.id = tm.user_id
      LEFT JOIN email_list el ON el.email = LOWER(u.email)
      WHERE tm.team_id = ${teamId} AND u.email IS NOT NULL AND u.email <> ''
      ORDER BY LOWER(u.email), tm.joined_at
    `) as unknown as Array<{
      email: string
      user_id: string
      first_name: string | null
      name: string
      unsubscribed_at: Date | null
      bounced_at: Date | null
      complained_at: Date | null
    }>
    if (players.length === 0) {
      return NextResponse.json({ error: 'No registered players on this team yet' }, { status: 400 })
    }

    const coachName = sender.kind === 'org' ? sender.orgName : sender.coachName
    const orgName = sender.orgName
    const subject =
      (p.subject ?? '')
        .toString()
        .replace(/[\r\n]+/g, ' ')
        .trim()
        .slice(0, 150) || `Message from ${coachName} · ${team.name}`

    const recipients: ResolvedRecipient[] = players.map((pl) => ({
      teamId: team.id,
      teamName: team.name,
      key: `member:${pl.user_id}`,
      name: pl.name,
      firstName: pl.first_name,
      email: pl.email,
      emailSource: 'own',
      userId: pl.user_id,
      submissionId: null,
      token: null,
      score: null,
      gradedAt: null,
      orgId: team.organization_id,
      orgName,
      status: pl.bounced_at ? 'bounced' : pl.unsubscribed_at || pl.complained_at ? 'unsubscribed' : 'ok',
    }))

    const report = await sendPlayerEmails(
      sender,
      { template: 'message', subject, message, includeResults: false, includeOffers: false, includeShopLink: false },
      recipients,
      'team_announce'
    )

    return NextResponse.json({
      success: true,
      sent: report.sent.length,
      total: players.length,
      skippedSuppressed: report.skipped.map((s) => s.name),
      failed: report.failed.map((f) => f.name),
    })
  } catch (err) {
    console.error('[team/announce] failed:', err)
    return NextResponse.json({ error: 'Could not send the announcement' }, { status: 500 })
  }
}
