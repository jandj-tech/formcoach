import { NextRequest, NextResponse } from 'next/server'
import { issueResetToken, resetCodeFromToken } from '@/lib/password-reset'
import { sendPasswordResetEmail, sendPasswordResetCodeEmail } from '@/lib/email'
import { rateLimitByIp } from '@/lib/rate-limit'

// Starts a password reset: if the email belongs to any account — player,
// coach, or organization — emails a reset link. The iOS app passes
// channel: 'app' to get a 6-digit code email instead, so the reset can be
// completed inside the app. Always returns success so the response can't be
// used to probe which emails are registered.
export async function POST(req: NextRequest) {
  try {
    const limit = await rateLimitByIp(req, 'forgot-password', 6, 3600)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — try again later' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const { email, channel } = (await req.json().catch(() => ({}))) as { email?: string; channel?: string }
    const emailLower = String(email || '').toLowerCase().trim()
    if (!emailLower) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

    try {
      const token = await issueResetToken(emailLower)
      if (token) {
        if (channel === 'app') {
          await sendPasswordResetCodeEmail(emailLower, resetCodeFromToken(token))
        } else {
          await sendPasswordResetEmail(emailLower, token)
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
