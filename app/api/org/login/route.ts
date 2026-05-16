import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signOrgSession, orgSessionCookieOptions } from '@/lib/org-auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const emailLower = email.toLowerCase().trim()
    const [org] = await db`
      SELECT id, admin_email, password_hash FROM organizations WHERE admin_email = ${emailLower}
    ` as unknown as [{ id: string; admin_email: string; password_hash: string } | undefined]

    if (!org) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, org.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const token = await signOrgSession({ orgId: org.id, adminEmail: org.admin_email })
    const res = NextResponse.json({ success: true })
    res.cookies.set(orgSessionCookieOptions(token))
    return res
  } catch (err) {
    console.error('Org login error:', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
