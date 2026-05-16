import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signSession, sessionCookieOptions } from '@/lib/auth'

// Completes a password reset: verifies the token, sets the new password,
// and logs the user in.
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

    const [user] = (await db`
      SELECT id, email FROM users
      WHERE reset_token = ${token} AND reset_token_expires > NOW()
    `) as unknown as [{ id: string; email: string } | undefined]

    if (!user) {
      return NextResponse.json(
        { error: 'This reset link is invalid or has expired. Request a new one.' },
        { status: 400 },
      )
    }

    const hash = await bcrypt.hash(password, 10)
    await db`
      UPDATE users
      SET password_hash = ${hash}, reset_token = NULL, reset_token_expires = NULL
      WHERE id = ${user.id}
    `

    const sessionToken = await signSession({ userId: user.id, email: user.email })
    const res = NextResponse.json({ success: true })
    res.cookies.set(sessionCookieOptions(sessionToken))
    return res
  } catch (err) {
    console.error('reset-password error:', err)
    return NextResponse.json({ error: 'Could not reset your password.' }, { status: 500 })
  }
}
