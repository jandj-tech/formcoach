import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { db } from '@/lib/db'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getOrgSessionFromRequest } from '@/lib/org-auth'

// Coach announcement blast: emails every registered player on the team.
// For urgent word — "practice is canceled" — typed by the coach verbatim.
export async function POST(req: NextRequest) {
  const p = await req.json().catch(() => ({})) as { teamId?: string; subject?: string; message?: string }
  const message = (p.message ?? '').toString().trim().slice(0, 5000)
  if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 })

  // Coach team session, or an org session that owns the team.
  const teamSession = await getTeamSessionFromRequest(req)
  const orgSession = teamSession ? null : await getOrgSessionFromRequest(req)
  if (!teamSession && !orgSession) return NextResponse.json({ error: 'Coach login required' }, { status: 401 })

  const teamId = (p.teamId ?? teamSession?.teamId ?? '').toString()
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

  try {
    const [team] = (await db`
      SELECT id, name, admin_email, coach_nickname, organization_id FROM teams WHERE id = ${teamId}
    `) as unknown as [{ id: string; name: string; admin_email: string; coach_nickname: string | null; organization_id: string | null } | undefined]
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

    const authorized =
      (teamSession && (teamSession.teamId === teamId || teamSession.adminEmail === team.admin_email)) ||
      (orgSession && team.organization_id === orgSession.orgId)
    if (!authorized) return NextResponse.json({ error: 'Not your team' }, { status: 403 })

    const players = (await db`
      SELECT DISTINCT u.email
      FROM team_memberships tm JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ${teamId}
    `) as unknown as Array<{ email: string }>
    if (players.length === 0) {
      return NextResponse.json({ error: 'No registered players on this team yet' }, { status: 400 })
    }

    const coachName = team.coach_nickname || 'Your coach'
    const subject = (p.subject ?? '').toString().trim().slice(0, 150) || `📣 Message from ${coachName} — ${team.name}`
    const resend = new Resend(process.env.RESEND_API_KEY!)

    const results = await Promise.allSettled(players.map(({ email }) =>
      resend.emails.send({
        from: 'LearnHoops <noreply@learnhoops.com>',
        to: email,
        replyTo: team.admin_email,
        subject,
        text: [
          `Message from ${coachName} (${team.name}):`,
          '',
          message,
          '',
          '—',
          'Sent through LearnHoops team announcements. Reply to reach your coach.',
        ].join('\n'),
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#000000;padding:20px 28px;">
              <h1 style="color:#F97316;margin:0;font-size:20px;">LearnHoops — ${team.name}</h1>
            </div>
            <div style="padding:28px;">
              <p style="color:#666;font-size:13px;margin:0 0 12px;">Message from <strong>${coachName}</strong>:</p>
              <div style="color:#000;font-size:16px;line-height:1.6;white-space:pre-wrap;border-left:4px solid #F97316;padding-left:16px;">${message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
              <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;"/>
              <p style="color:#999;font-size:11px;">Sent through LearnHoops team announcements. Reply to reach your coach.</p>
            </div>
          </div>`,
      })
    ))

    const sent = results.filter(r => r.status === 'fulfilled').length
    return NextResponse.json({ success: true, sent, total: players.length })
  } catch (err) {
    console.error('[team/announce] failed:', err)
    return NextResponse.json({ error: 'Could not send the announcement' }, { status: 500 })
  }
}
