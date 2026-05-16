import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signSession, sessionCookieOptions } from '@/lib/auth'
import { signTeamSession, teamSessionCookieOptions } from '@/lib/team-auth'
import { signOrgSession, orgSessionCookieOptions } from '@/lib/org-auth'

// Unified login: one form for players, coaches, and organizations.
// The email + password is matched against each account type — organization,
// team coach, then player — and logs the person into whichever they are.
export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const emailLower = email.toLowerCase().trim()

    // 1. Organization account
    const [org] = (await db`
      SELECT id, admin_email, password_hash FROM organizations WHERE admin_email = ${emailLower}
    `) as unknown as [{ id: string; admin_email: string; password_hash: string } | undefined]
    if (org && (await bcrypt.compare(password, org.password_hash))) {
      const token = await signOrgSession({ orgId: org.id, adminEmail: org.admin_email })
      const res = NextResponse.json({ success: true, redirect: '/org/dashboard' })
      res.cookies.set(orgSessionCookieOptions(token))
      return res
    }

    // 2. Team founding coach — all of a coach's teams share one password.
    const teams = (await db`
      SELECT id, admin_email, password_hash, name FROM teams
      WHERE admin_email = ${emailLower} AND password_hash IS NOT NULL
    `) as unknown as Array<{ id: string; admin_email: string; password_hash: string; name: string }>
    if (teams.length > 0 && (await bcrypt.compare(password, teams[0].password_hash))) {
      if (teams.length > 1) {
        return NextResponse.json({
          multipleTeams: true,
          teams: teams.map(t => ({ id: t.id, name: t.name })),
        })
      }
      const team = teams[0]
      const token = await signTeamSession({ teamId: team.id, adminEmail: team.admin_email })
      const res = NextResponse.json({ success: true, redirect: '/team/dashboard' })
      res.cookies.set(teamSessionCookieOptions(token))
      return res
    }

    // 3. Additional team coach (team_coaches)
    try {
      const [coach] = (await db`
        SELECT team_id, email, password_hash FROM team_coaches
        WHERE email = ${emailLower} AND password_hash IS NOT NULL
      `) as unknown as [{ team_id: string; email: string; password_hash: string } | undefined]
      if (coach && (await bcrypt.compare(password, coach.password_hash))) {
        const token = await signTeamSession({ teamId: coach.team_id, adminEmail: coach.email })
        const res = NextResponse.json({ success: true, redirect: '/team/dashboard' })
        res.cookies.set(teamSessionCookieOptions(token))
        return res
      }
    } catch (err) {
      console.warn('team_coaches lookup failed (table may not exist yet):', err instanceof Error ? err.message : err)
    }

    // 4. Player account
    const [user] = (await db`
      SELECT id, email, password_hash FROM users WHERE email = ${emailLower}
    `) as unknown as [{ id: string; email: string; password_hash: string } | undefined]
    if (user && (await bcrypt.compare(password, user.password_hash))) {
      const token = await signSession({ userId: user.id, email: user.email })
      const res = NextResponse.json({ success: true })
      res.cookies.set(sessionCookieOptions(token))
      return res
    }

    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
