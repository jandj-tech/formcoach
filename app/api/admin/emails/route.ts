import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

async function isAdmin() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

// Add an email to the email list.
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email } = (await req.json().catch(() => ({}))) as { email?: string }
  const value = email?.toLowerCase().trim()
  if (!value || !value.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  await db`
    INSERT INTO email_list (email) VALUES (${value})
    ON CONFLICT (email) DO NOTHING
  `
  return NextResponse.json({ success: true })
}

// Remove an email from the email list entirely.
export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email } = (await req.json().catch(() => ({}))) as { email?: string }
  const value = email?.toLowerCase().trim()
  if (!value) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

  await db`DELETE FROM email_list WHERE email = ${value}`
  return NextResponse.json({ success: true })
}
