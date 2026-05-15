import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signTeamSession, teamSessionCookieOptions } from '@/lib/team-auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const emailLower = email.toLowerCase().trim()
    const [team] = await db`
      SELECT id, admin_email, password_hash FROM teams WHERE admin_email = ${emailLower}
    ` as unknown as [{ id: string; admin_email: string; password_hash: string } | undefined]

    if (!team) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, team.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const token = await signTeamSession({ teamId: team.id, adminEmail: team.admin_email })
    const res = NextResponse.json({ success: true })
    res.cookies.set(teamSessionCookieOptions(token))
    return res
  } catch (err) {
    console.error('Team login error:', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
