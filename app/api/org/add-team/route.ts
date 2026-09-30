import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { orgCanAddTeam, orgIsEntitledById, SUBSCRIPTION_ENDED_MESSAGE, TEAM_LIMIT_MESSAGE } from '@/lib/team-features'
import { sendCoachInviteEmail, sendCoachAddedEmail, sendTeamCreatedEmail } from '@/lib/email'
import { cleanDisplayText, cleanOptionalDisplayText } from '@/lib/moderation'
import { resolveBaseUrl } from '@/lib/base-url'
import { sameOrgCoachCredential } from '@/lib/team-auth'

function generateAccessCode(): string {
  // randomInt, not Math.random: an access code is a bearer credential (it lets
  // an anonymous player spend the coach's credits), and Math.random is
  // predictable from prior outputs.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[crypto.randomInt(chars.length)]
  }
  return code
}

export async function POST(req: NextRequest) {
  try {
    const session = await getOrgSessionFromRequest(req)
    if (!session) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
    }

    // A lapsed organization keeps what it has but cannot grow. Deleting,
    // renaming and moving tokens around all still work — see
    // lib/team-features.ts.
    if (!(await orgIsEntitledById(session.orgId))) {
      return NextResponse.json(
        { error: SUBSCRIPTION_ENDED_MESSAGE, subscriptionEnded: true },
        { status: 402 },
      )
    }

    // Basic covers one team. Class-package teams are exempt — buying a class
    // auto-creates a team, and that was paid for separately, per player.
    if (!(await orgCanAddTeam(session.orgId))) {
      return NextResponse.json(
        { error: TEAM_LIMIT_MESSAGE, upgradeRequired: true },
        { status: 402 },
      )
    }

    const { name: rawName, ageGroup: rawAgeGroup, coachEmail, coachName } = await req.json()
    if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
      return NextResponse.json({ error: 'Team name is required' }, { status: 400 })
    }
    const teamName = cleanDisplayText(rawName, 255)
    if (!teamName.ok) return NextResponse.json({ error: teamName.error }, { status: 400 })
    const coach = cleanOptionalDisplayText(coachName, 100)
    if (!coach.ok) return NextResponse.json({ error: coach.error }, { status: 400 })
    const ageGroup = cleanOptionalDisplayText(rawAgeGroup, 50)
    if (!ageGroup.ok) return NextResponse.json({ error: ageGroup.error }, { status: 400 })
    const name = teamName.value

    // Coach email is optional — if blank, the org owner coaches the team itself.
    const emailLower = typeof coachEmail === 'string' ? coachEmail.toLowerCase().trim() : ''

    const [org] = await db`
      SELECT id, name FROM organizations WHERE id = ${session.orgId}
    ` as unknown as [{ id: string; name: string } | undefined]
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const ageGroupValue = ageGroup.value

    // Generate a unique access code (retry on rare collision)
    let accessCode = generateAccessCode()
    for (let attempt = 0; attempt < 5; attempt++) {
      const collision = await db`SELECT id FROM teams WHERE access_code = ${accessCode}`
      if (collision.length === 0) break
      accessCode = generateAccessCode()
    }

    // --- Self-coached: the org owner is the coach. No invite, no separate
    // account — the org opens this team from the org dashboard. ---
    if (!emailLower) {
      const nickname = coach.value
      await db`
        INSERT INTO teams (name, admin_email, password_hash, access_code, organization_id, age_group, coach_nickname)
        VALUES (${name}, ${session.adminEmail}, ${null}, ${accessCode}, ${org.id}, ${ageGroupValue}, ${nickname})
      `
      const baseUrl = resolveBaseUrl()
      try {
        await sendTeamCreatedEmail(session.adminEmail, org.name, name, accessCode, `${baseUrl}/org/dashboard`)
      } catch {}
      return NextResponse.json({ success: true, teamCode: accessCode, selfCoached: true })
    }

    // The coach's display name is kept for every kind of team, not only
    // self-coached ones (it used to be dropped when an email was given).
    const coachNickname = coach.value

    // A coach who already coaches on another team of THIS organization (a
    // row there with a password) gets the new team on that same password —
    // no invite needed. Anyone else, including an address that has a
    // password only on another org's team or on a self-registered team, gets
    // the normal emailed invite: copying a hash from any row with this email
    // let a stranger who registered a team under the coach's address first
    // walk into the org's new team with their own password.
    const existingCoach = await sameOrgCoachCredential(emailLower, org.id)

    if (existingCoach) {
      await db`
        INSERT INTO teams (name, admin_email, password_hash, access_code, organization_id, age_group, coach_nickname)
        VALUES (${name}, ${emailLower}, ${existingCoach.hash}, ${accessCode}, ${org.id}, ${ageGroupValue}, ${coachNickname})
      `
      await sendCoachAddedEmail(emailLower, org.name, name)
      return NextResponse.json({ success: true, teamCode: accessCode })
    }

    const inviteToken = crypto.randomBytes(32).toString('hex')

    await db`
      INSERT INTO teams (name, admin_email, password_hash, access_code, organization_id, age_group, coach_invite_token, invite_sent_at, coach_nickname)
      VALUES (${name}, ${emailLower}, ${null}, ${accessCode}, ${org.id}, ${ageGroupValue}, ${inviteToken}, NOW(), ${coachNickname})
    `

    await sendCoachInviteEmail(emailLower, org.name, name, inviteToken)

    return NextResponse.json({ success: true, teamCode: accessCode })
  } catch (err) {
    console.error('Org add-team error:', err)
    return NextResponse.json({ error: 'Failed to add team' }, { status: 500 })
  }
}
