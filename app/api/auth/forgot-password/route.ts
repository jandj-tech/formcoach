import { NextRequest, NextResponse } from 'next/server'
import { issueResetTokens, resetCodeFromToken } from '@/lib/password-reset'
import { sendPasswordResetEmail, sendPasswordResetCodeEmail } from '@/lib/email'
import { rateLimitLogin } from '@/lib/rate-limit'

// Starts a password reset: if the email belongs to any account — player,
// coach, or organization — emails a reset link (one per player account when
// siblings share the address). The iOS app passes
// channel: 'app' to get a 6-digit code email instead, so the reset can be
// completed inside the app. Always returns success so the response can't be
// used to probe which emails are registered.
export async function POST(req: NextRequest) {
  try {
    const { email, channel } = (await req.json().catch(() => ({}))) as { email?: string; channel?: string }
    const emailLower = String(email || '').toLowerCase().trim()

    // Per email: stops anyone using this form to flood one inbox with reset
    // mail. Per IP (looser): a gym full of parents on one Wi-Fi can all reset,
    // but one machine still can't spray thousands of addresses.
    const limit = await rateLimitLogin(req, 'forgot-password', emailLower, {
      perIp: 30, perEmail: 3, windowSeconds: 3600,
    })
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many reset requests. Please check your inbox (and spam folder) or try again in an hour.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    if (!emailLower) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

    try {
      // Several player accounts on one address (siblings) each get their own
      // link / code in the one email ("Reset Liam's password"), and each
      // resets only that child. Everyone else gets the single link as before.
      const issued = await issueResetTokens(emailLower)
      if (issued?.kind === 'single') {
        if (channel === 'app') {
          await sendPasswordResetCodeEmail(emailLower, resetCodeFromToken(issued.token))
        } else {
          await sendPasswordResetEmail(emailLower, issued.token)
        }
      } else if (issued?.kind === 'players') {
        const accounts = issued.accounts.map((a) => ({ label: a.label, shared: a.shared, token: a.token }))
        if (channel === 'app') {
          await sendPasswordResetCodeEmail(
            emailLower,
            resetCodeFromToken(accounts[0].token),
            accounts.map((a) => ({ label: a.label, shared: a.shared, code: resetCodeFromToken(a.token) })),
          )
        } else {
          await sendPasswordResetEmail(emailLower, accounts[0].token, accounts)
        }
      }
    } catch (err) {
      console.error('forgot-password: could not issue reset:', err)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('forgot-password error:', err)
    // Still return success — never reveal whether the email exists.
    return NextResponse.json({ success: true })
  }
}
