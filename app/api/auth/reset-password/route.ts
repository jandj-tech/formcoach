import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { consumeResetToken } from '@/lib/password-reset'
import { signSession, sessionCookieOptions } from '@/lib/auth'
import { signTeamSession, teamSessionCookieOptions } from '@/lib/team-auth'
import { signOrgSession, orgSessionCookieOptions } from '@/lib/org-auth'
import { clearOtherSessions, PLAYER_COOKIE, TEAM_COOKIE, ORG_COOKIE } from '@/lib/sessions'

// Completes a password reset: verifies the token, sets the new password on the
// matching account (player, coach, or organization), and logs them in.
export async function POST(req: NextRequest) {
  try {
    const { token, password } = (await req.json().catch(() => ({}))) as {
      token?: string
      password?: string
    }
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Invalid reset link' }, { status: 400 })
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Password (6+ characters) required' }, { status: 400 })
    }

    const hash = await bcrypt.hash(password, 10)
    const target = await consumeResetToken(token, hash)

    if (!target) {
      return NextResponse.json(
        { error: 'This reset link is invalid or has expired. Request a new one.' },
        { status: 400 },
      )
    }

    const res = NextResponse.json({ success: true, redirect: target.redirect })

    if (target.kind === 'user') {
      const sessionToken = await signSession({ userId: target.userId!, email: target.email })
      res.cookies.set(sessionCookieOptions(sessionToken))
      clearOtherSessions(res, PLAYER_COOKIE)
    } else if (target.kind === 'org') {
      const sessionToken = await signOrgSession({ orgId: target.orgId!, adminEmail: target.email })
      res.cookies.set(orgSessionCookieOptions(sessionToken))
      clearOtherSessions(res, ORG_COOKIE)
    } else {
      // 'team' (founding coach) or 'team_coach' (additional coach)
      const sessionToken = await signTeamSession({ teamId: target.teamId!, adminEmail: target.email })
      res.cookies.set(teamSessionCookieOptions(sessionToken))
      clearOtherSessions(res, TEAM_COOKIE)
    }

    return res
  } catch (err) {
    console.error('reset-password error:', err)
    return NextResponse.json({ error: 'Could not reset your password.' }, { status: 500 })
  }
}
