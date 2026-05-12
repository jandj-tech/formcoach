import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signSession, sessionCookieOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const emailLower = email.toLowerCase().trim()
    const [user] = await db`SELECT id, email, password_hash FROM users WHERE email = ${emailLower}` as unknown as [{ id: string; email: string; password_hash: string } | undefined]

    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const token = await signSession({ userId: user.id, email: user.email })
    const res = NextResponse.json({ success: true })
    res.cookies.set(sessionCookieOptions(token))
    return res
  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
