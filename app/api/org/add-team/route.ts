import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { sendCoachInviteEmail } from '@/lib/email'

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

    const { name, ageGroup, coachEmail } = await req.json()
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Team name is required' }, { status: 400 })
    }
    if (!coachEmail || typeof coachEmail !== 'string' || !coachEmail.trim()) {
      return NextResponse.json({ error: 'Coach email is required' }, { status: 400 })
    }

    const emailLower = coachEmail.toLowerCase().trim()

    const [org] = await db`
      SELECT id, name FROM organizations WHERE id = ${session.orgId}
    ` as unknown as [{ id: string; name: string } | undefined]
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const existing = await db`SELECT id FROM teams WHERE admin_email = ${emailLower}`
    if (existing.length > 0) {
      return NextResponse.json({ error: 'A team already exists for this coach email.' }, { status: 409 })
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
