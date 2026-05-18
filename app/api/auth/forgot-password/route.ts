import { NextRequest, NextResponse } from 'next/server'
import { issueResetToken } from '@/lib/password-reset'
import { sendPasswordResetEmail } from '@/lib/email'

// Starts a password reset: if the email belongs to any account — player,
// coach, or organization — emails a reset link. Always returns success so the
// response can't be used to probe which emails are registered.
export async function POST(req: NextRequest) {
  try {
    const { email } = (await req.json().catch(() => ({}))) as { email?: string }
    const emailLower = String(email || '').toLowerCase().trim()
    if (!emailLower) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

    try {
      const token = await issueResetToken(emailLower)
      if (token) {
        await sendPasswordResetEmail(emailLower, token)
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
