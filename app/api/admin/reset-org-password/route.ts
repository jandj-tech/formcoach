import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

async function isAdmin() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

// Lets an admin set a new password for an organization. Existing passwords
// can't be read (they're hashed) — this overwrites with a fresh hash.
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId, password } = (await req.json().catch(() => ({}))) as {
    orgId?: string
    password?: string
  }
  if (!orgId || !password || password.length < 6) {
    return NextResponse.json({ error: 'orgId and a 6+ character password are required' }, { status: 400 })
  }

  const hash = await bcrypt.hash(password, 10)
  await db`UPDATE organizations SET password_hash = ${hash} WHERE id = ${orgId}`

  return NextResponse.json({ success: true })
}
