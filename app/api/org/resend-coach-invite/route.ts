import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sendCoachInviteEmail, sendCoachSignupEmail } from '@/lib/email'
import { markCoachInviteEmailedOnly } from '@/lib/team-auth'

// Re-sends a coach's setup invite for one of the org's teams: the head coach
// ({ teamId }) or an added coach ({ teamId, coachId }). Only while they
// haven't set a password yet. Rate-limited per coach.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { teamId?: string; coachId?: string }
  if (!body.teamId) return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })

  const [team] = (await db`
    SELECT t.id, t.name, t.admin_email, t.password_hash, t.coach_invite_token,
           o.name AS org_name, o.admin_email AS org_email
    FROM teams t JOIN organizations o ON o.id = t.organization_id
    WHERE t.id = ${body.teamId} AND t.organization_id = ${session.orgId}
  `) as unknown as [{
    id: string
    name: string
    admin_email: string
    password_hash: string | null
    coach_invite_token: string | null
    org_name: string
    org_email: string
  } | undefined]
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const tooMany = () => NextResponse.json(
    { error: 'We already sent this invite a few times in the last hour. Try again later.' },
    { status: 429 },
  )

  try {
    if (body.coachId) {
      const [coach] = (await db`
        SELECT id, email, password_hash, invite_token FROM team_coaches
        WHERE id = ${body.coachId} AND team_id = ${team.id}
      `) as unknown as [{ id: string; email: string; password_hash: string | null; invite_token: string | null } | undefined]
      if (!coach) return NextResponse.json({ error: 'That coach isn’t on this team any more.' }, { status: 404 })
      if (coach.password_hash) return NextResponse.json({ error: 'This coach has already set up their account.' }, { status: 409 })
      if (!(await rateLimit(`coach-invite:${coach.id}`, 3, 3600)).ok) return tooMany()
      let token = coach.invite_token
      if (!token) {
        token = crypto.randomBytes(32).toString('hex')
        await db`UPDATE team_coaches SET invite_token = ${token} WHERE id = ${coach.id}`
        // This fresh token goes only to the inbox (the response never carries
        // it), so accepting it proves the address. A reused token keeps its
        // flag: it may have been shown to the inviter when first created.
        await markCoachInviteEmailedOnly(coach.id)
      }
      await sendCoachSignupEmail(coach.email, team.name, token)
      return NextResponse.json({ ok: true, emailedTo: coach.email })
    }

    if (team.password_hash) return NextResponse.json({ error: 'The head coach has already set up their account.' }, { status: 409 })
    if (team.admin_email.toLowerCase() === team.org_email.toLowerCase()) {
      return NextResponse.json({ error: 'Your organization coaches this team itself, so there is no invite to send.' }, { status: 409 })
    }
    if (!(await rateLimit(`coach-invite:head:${team.id}`, 3, 3600)).ok) return tooMany()
    let token = team.coach_invite_token
    if (!token) {
      token = crypto.randomBytes(32).toString('hex')
      await db`UPDATE teams SET coach_invite_token = ${token}, invite_sent_at = NOW() WHERE id = ${team.id}`
    } else {
      await db`UPDATE teams SET invite_sent_at = NOW() WHERE id = ${team.id}`
    }
    await sendCoachInviteEmail(team.admin_email, team.org_name, team.name, token)
    return NextResponse.json({ ok: true, emailedTo: team.admin_email })
  } catch (err) {
    console.error('resend-coach-invite error:', err)
    return NextResponse.json({ error: 'Could not send the email. Try again shortly.' }, { status: 502 })
  }
}
