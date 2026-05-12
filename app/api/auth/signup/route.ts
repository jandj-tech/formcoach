import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signSession, sessionCookieOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password || password.length < 6) {
      return NextResponse.json({ error: 'Email and password (6+ chars) required' }, { status: 400 })
    }

    const emailLower = email.toLowerCase().trim()

    // Check subscription exists for this email before allowing account creation
    const [sub] = await db`
      SELECT subscription_type, subscription_expires_at
      FROM email_list
      WHERE email = ${emailLower}
    `

    const isSubscribed =
      sub?.subscription_type &&
      sub?.subscription_expires_at &&
      new Date(sub.subscription_expires_at) > new Date()

    if (!isSubscribed) {
      return NextResponse.json({ error: 'No active subscription found for this email' }, { status: 403 })
    }

    const existing = await db`SELECT id FROM users WHERE email = ${emailLower}`
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Account already exists. Please log in.' }, { status: 409 })
    }

    const hash = await bcrypt.hash(password, 10)

    const [user] = await db`
      INSERT INTO users (email, password_hash, subscription_type, subscription_expires_at)
      VALUES (${emailLower}, ${hash}, ${sub.subscription_type}, ${sub.subscription_expires_at})
      RETURNING id, email
    ` as unknown as [{ id: string; email: string }]

    // Link any existing anonymous submissions for this email
    await db`UPDATE submissions SET user_id = ${user.id} WHERE email = ${emailLower} AND user_id IS NULL`

    const token = await signSession({ userId: user.id, email: user.email })
    const res = NextResponse.json({ success: true })
    res.cookies.set(sessionCookieOptions(token))
    return res
  } catch (err) {
    console.error('Signup error:', err)
    return NextResponse.json({ error: 'Signup failed' }, { status: 500 })
  }
}
