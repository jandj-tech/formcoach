import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import {
  consumeResetToken,
  peekResetTokenByEmail,
  playerForResetToken,
  resetTokenStatus,
  siblingPasswordClash,
  SIBLING_PASSWORD_CODE,
} from '@/lib/password-reset'
import { verifyChosenAccountToken } from '@/lib/email-entitlements'
import { signSession, sessionCookieOptions } from '@/lib/auth'
import { signTeamSession, teamSessionCookieOptions } from '@/lib/team-auth'
import { signOrgSession, orgSessionCookieOptions } from '@/lib/org-auth'
import { clearOtherSessions, PLAYER_COOKIE, TEAM_COOKIE, ORG_COOKIE } from '@/lib/sessions'
import { sendPasswordChangedEmail } from '@/lib/email'
import { BCRYPT_COST } from '@/lib/password'
import { rateLimit, rateLimitByIp } from '@/lib/rate-limit'
import { safeLocalPath } from '@/lib/safe-next'

// Completes a password reset: verifies the token, sets the new password on the
// matching account (player, coach, or organization), and logs them in. The web
// flow sends the token from the emailed link; the iOS app sends email + the
// 6-digit code from the app-variant email instead.
//
// Several player accounts may share one address (siblings): every token and
// code names ONE account, and the new password may not be one that already
// opens a sibling's account (lib/password-reset.ts siblingPasswordClash).

// GET ?token= — read-only status for the page: whether the link still works
// (so a used or expired link says so before a password is typed), and which
// player it is for when that helps — the name on a family email, or "First L."
// for a coach/org-added player finishing setup. Only the token's holder (the
// inbox) learns the name; nothing is consumed or rotated.
export async function GET(req: NextRequest) {
  const limit = await rateLimitByIp(req, 'reset-password-peek', 120, 3600)
  if (!limit.ok) return NextResponse.json({ valid: null }, { status: 429 })
  const token = req.nextUrl.searchParams.get('token') ?? ''
  const status = await resetTokenStatus(token)
  if (!status.valid) return NextResponse.json({ valid: false })
  const p = status.player
  if (!p) return NextResponse.json({ valid: true })
  return NextResponse.json({
    valid: true,
    // A one-account reset link reads as before: no name.
    ...(p.siblings > 0 && p.firstName ? { firstName: p.firstName, setup: p.setup } : {}),
    ...(p.rosterSetup && p.label ? { rosterSetup: true, setupName: p.label } : {}),
  })
}

export async function POST(req: NextRequest) {
  try {
    const limit = await rateLimitByIp(req, 'reset-password', 60, 3600)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — try again later' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const { token: bodyToken, email, code, password, chosen, next } = (await req.json().catch(() => ({}))) as {
      token?: string
      email?: string
      code?: string
      password?: string
      chosen?: string
      /** Where a player lands afterwards (a "see your results" setup link). Same-site paths only. */
      next?: unknown
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
      // Siblings on one address each have their own code: whichever
      // account's code this is gets reset.
      const stored = await peekResetTokenByEmail(emailLower, codeDigits)
      if (!stored) {
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

    // Different-password rule: checked before anything is consumed, so the
    // same link / code works again with another password.
    const player = await playerForResetToken(token)
    if (player) {
      const clash = await siblingPasswordClash(player.email, password, player.id)
      if (clash) return NextResponse.json({ error: clash, code: SIBLING_PASSWORD_CODE }, { status: 400 })
    }

    const chosenUserId = player ? await verifyChosenAccountToken(chosen, token) : null
    const hash = await bcrypt.hash(password, BCRYPT_COST)
    const target = await consumeResetToken(token, hash, { chosenUserId })

    if (!target) {
      return NextResponse.json(
        { error: 'This reset link is invalid or has expired. Request a new one.' },
        { status: 400 },
      )
    }

    // Non-fatal security notification — for a real password change only.
    // Finishing a coach/org-added account from its setup link sets the first
    // password; telling that parent their password "was changed" alarms them.
    if (!target.firstPassword) {
      try { await sendPasswordChangedEmail(target.email) } catch {}
    }

    // `token` in the JSON is for the mobile app (Bearer auth), matching login;
    // the web ignores it and follows the cookie + redirect.
    let sessionToken: string
    let res: NextResponse
    if (target.kind === 'user') {
      sessionToken = await signSession({ userId: target.userId!, email: target.email }, hash)
      // Only a player honours `next`; coaches and orgs always go to their dashboard.
      const redirect = safeLocalPath(next) ?? target.redirect
      res = NextResponse.json({ success: true, redirect, token: sessionToken })
      res.cookies.set(sessionCookieOptions(sessionToken))
      clearOtherSessions(res, PLAYER_COOKIE)
    } else if (target.kind === 'org') {
      sessionToken = await signOrgSession({ orgId: target.orgId!, adminEmail: target.email }, hash)
      res = NextResponse.json({ success: true, redirect: target.redirect, token: sessionToken })
      res.cookies.set(orgSessionCookieOptions(sessionToken))
      clearOtherSessions(res, ORG_COOKIE)
    } else {
      // 'team' (founding coach) or 'team_coach' (additional coach)
      sessionToken = await signTeamSession({ teamId: target.teamId!, adminEmail: target.email }, hash)
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
