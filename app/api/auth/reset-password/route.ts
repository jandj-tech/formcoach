import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { consumeResetToken, peekResetTokenByEmail, resetCodeFromToken } from '@/lib/password-reset'
import { signSession, sessionCookieOptions } from '@/lib/auth'
import { signTeamSession, teamSessionCookieOptions } from '@/lib/team-auth'
import { signOrgSession, orgSessionCookieOptions } from '@/lib/org-auth'
import { clearOtherSessions, PLAYER_COOKIE, TEAM_COOKIE, ORG_COOKIE } from '@/lib/sessions'
import { sendPasswordChangedEmail } from '@/lib/email'
import { BCRYPT_COST } from '@/lib/password'
import { rateLimit, rateLimitByIp } from '@/lib/rate-limit'

// Completes a password reset: verifies the token, sets the new password on the
// matching account (player, coach, or organization), and logs them in. The web
// flow sends the token from the emailed link; the iOS app sends email + the
// 6-digit code from the app-variant email instead.
export async function POST(req: NextRequest) {
  try {
    const limit = await rateLimitByIp(req, 'reset-password', 10, 3600)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — try again later' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const { token: bodyToken, email, code, password } = (await req.json().catch(() => ({}))) as {
      token?: string
      email?: string
      code?: string
      password?: string
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Password (6+ characters) required' }, { status: 400 })
    }

    let token = typeof bodyToken === 'string' && bodyToken ? bodyToken : null

    // App flow: email + 6-digit code stand in for the emailed link's token.
    if (!token && typeof email === 'string' && typeof code === 'string') {
      const emailLower = email.toLowerCase().trim()
      const codeDigits = code.replace(/\D/g, '')
      if (!emailLower || codeDigits.length !== 6) {
        return NextResponse.json({ error: 'Enter the 6-digit code from your email.' }, { status: 400 })
      }
      // A 6-digit code is only safe behind a tight per-account attempt limit.
      const codeLimit = await rateLimit(`reset-code:${emailLower}`, 5, 900)
      if (!codeLimit.ok) {
        return NextResponse.json(
          { error: 'Too many code attempts — request a new code and try again later.' },
          { status: 429, headers: { 'Retry-After': String(codeLimit.retryAfterSeconds) } }
        )
      }
      const stored = await peekResetTokenByEmail(emailLower)
      const expected = stored ? resetCodeFromToken(stored) : null
      const matches =
        !!expected &&
        crypto.timingSafeEqual(Buffer.from(codeDigits), Buffer.from(expected))
      if (!stored || !matches) {
        return NextResponse.json(
          { error: 'That code is incorrect or has expired. Request a new one.' },
          { status: 400 }
        )
      }
      token = stored
    }

    if (!token) {
      return NextResponse.json({ error: 'Invalid reset link' }, { status: 400 })
    }

    const hash = await bcrypt.hash(password, BCRYPT_COST)
    const target = await consumeResetToken(token, hash)

    if (!target) {
      return NextResponse.json(
        { error: 'This reset link is invalid or has expired. Request a new one.' },
        { status: 400 },
      )
    }

    // Non-fatal security notification
    try { await sendPasswordChangedEmail(target.email) } catch {}

    // `token` in the JSON is for the mobile app (Bearer auth), matching login;
    // the web ignores it and follows the cookie + redirect.
    let sessionToken: string
    let res: NextResponse
    if (target.kind === 'user') {
      sessionToken = await signSession({ userId: target.userId!, email: target.email })
      res = NextResponse.json({ success: true, redirect: target.redirect, token: sessionToken })
      res.cookies.set(sessionCookieOptions(sessionToken))
      clearOtherSessions(res, PLAYER_COOKIE)
    } else if (target.kind === 'org') {
      sessionToken = await signOrgSession({ orgId: target.orgId!, adminEmail: target.email })
      res = NextResponse.json({ success: true, redirect: target.redirect, token: sessionToken })
      res.cookies.set(orgSessionCookieOptions(sessionToken))
      clearOtherSessions(res, ORG_COOKIE)
    } else {
      // 'team' (founding coach) or 'team_coach' (additional coach)
      sessionToken = await signTeamSession({ teamId: target.teamId!, adminEmail: target.email })
      res = NextResponse.json({ success: true, redirect: target.redirect, token: sessionToken })
      res.cookies.set(teamSessionCookieOptions(sessionToken))
      clearOtherSessions(res, TEAM_COOKIE)
    }

    return res
  } catch (err) {
    console.error('reset-password error:', err)
    return NextResponse.json({ error: 'Could not reset your password.' }, { status: 500 })
  }
}
