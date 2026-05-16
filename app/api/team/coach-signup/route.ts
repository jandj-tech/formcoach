import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signTeamSession, teamSessionCookieOptions } from '@/lib/team-auth'

// A newly-invited coach sets their password via the signup link, which logs
// them into the team dashboard.
export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json()
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Invalid signup link' }, { status: 400 })
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Password (6+ characters) required' }, { status: 400 })
    }

    const [coach] = (await db`
      SELECT id, team_id, email FROM team_coaches WHERE invite_token = ${token}
    `) as unknown as [{ id: string; team_id: string; email: string } | undefined]

    if (!coach) {
      return NextResponse.json({ error: 'This signup link is invalid or already used.' }, { status: 404 })
    }

    const hash = await bcrypt.hash(password, 10)
    await db`
      UPDATE team_coaches SET password_hash = ${hash}, invite_token = NULL WHERE id = ${coach.id}
    `

    const sessionToken = await signTeamSession({ teamId: coach.team_id, adminEmail: coach.email })
    const res = NextResponse.json({ success: true })
    res.cookies.set(teamSessionCookieOptions(sessionToken))
    return res
  } catch (err) {
    console.error('Coach signup error:', err)
    return NextResponse.json({ error: 'Signup failed' }, { status: 500 })
  }
}
