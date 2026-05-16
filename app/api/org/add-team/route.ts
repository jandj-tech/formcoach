import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { sendCoachInviteEmail, sendCoachAddedEmail } from '@/lib/email'

function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export async function POST(req: NextRequest) {
  try {
    const session = await getOrgSessionFromRequest(req)
    if (!session) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
    }

    const { name, ageGroup, coachEmail, coachName } = await req.json()
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Team name is required' }, { status: 400 })
    }

    // Coach email is optional — if blank, the org owner coaches the team itself.
    const emailLower = typeof coachEmail === 'string' ? coachEmail.toLowerCase().trim() : ''

    const [org] = await db`
      SELECT id, name FROM organizations WHERE id = ${session.orgId}
    ` as unknown as [{ id: string; name: string } | undefined]
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const ageGroupValue =
      typeof ageGroup === 'string' && ageGroup.trim() ? ageGroup.trim() : null

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
      const nickname =
        typeof coachName === 'string' && coachName.trim() ? coachName.trim().slice(0, 100) : null
      await db`
        INSERT INTO teams (name, admin_email, password_hash, access_code, organization_id, age_group, coach_nickname)
        VALUES (${name.trim()}, ${session.adminEmail}, ${null}, ${accessCode}, ${org.id}, ${ageGroupValue}, ${nickname})
      `
      return NextResponse.json({ success: true, teamCode: accessCode, selfCoached: true })
    }

    // If this coach already has a set-up account (a team with a password),
    // add the new team using that same password — no invite needed.
    const [existingCoach] = await db`
      SELECT password_hash FROM teams
      WHERE admin_email = ${emailLower} AND password_hash IS NOT NULL
      LIMIT 1
    ` as unknown as [{ password_hash: string } | undefined]

    if (existingCoach) {
      await db`
        INSERT INTO teams (name, admin_email, password_hash, access_code, organization_id, age_group)
        VALUES (${name.trim()}, ${emailLower}, ${existingCoach.password_hash}, ${accessCode}, ${org.id}, ${ageGroupValue})
      `
      await sendCoachAddedEmail(emailLower, org.name, name.trim())
      return NextResponse.json({ success: true, teamCode: accessCode })
    }

    const inviteToken = crypto.randomBytes(32).toString('hex')

    await db`
      INSERT INTO teams (name, admin_email, password_hash, access_code, organization_id, age_group, coach_invite_token, invite_sent_at)
      VALUES (${name.trim()}, ${emailLower}, ${null}, ${accessCode}, ${org.id}, ${ageGroupValue}, ${inviteToken}, NOW())
    `

    await sendCoachInviteEmail(emailLower, org.name, name.trim(), inviteToken)

    return NextResponse.json({ success: true, teamCode: accessCode })
  } catch (err) {
    console.error('Org add-team error:', err)
    return NextResponse.json({ error: 'Failed to add team' }, { status: 500 })
  }
}
