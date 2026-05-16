import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'

// Starts a password reset: if the email has an account, emails a reset link.
// Always returns success so the response can't be used to probe which emails
// are registered.
export async function POST(req: NextRequest) {
  try {
    const { email } = (await req.json().catch(() => ({}))) as { email?: string }
    const emailLower = String(email || '').toLowerCase().trim()
    if (!emailLower) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

    const [user] = (await db`
      SELECT id FROM users WHERE email = ${emailLower}
    `) as unknown as [{ id: string } | undefined]

    if (user) {
      try {
        const token = crypto.randomBytes(32).toString('hex')
        const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
        await db`
          UPDATE users SET reset_token = ${token}, reset_token_expires = ${expires}
          WHERE id = ${user.id}
        `
        await sendPasswordResetEmail(emailLower, token)
      } catch (err) {
        console.error('forgot-password: could not issue reset token:', err)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('forgot-password error:', err)
    // Still return success — never reveal whether the email exists.
    return NextResponse.json({ success: true })
  }
}
