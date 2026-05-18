import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { sendOrgApprovalEmail } from '@/lib/email'

async function isAdminAuthed(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

export async function GET() {
  if (!(await isAdminAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const applications = await db`
    SELECT id, org_name, email, player_count, status, created_at, approved_at
    FROM org_applications
    ORDER BY created_at DESC
    LIMIT 200
  `
  return NextResponse.json({ applications })
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const [app] = await db`
    SELECT id, org_name, email, status FROM org_applications WHERE id = ${id}
  ` as unknown as [{ id: string; org_name: string; email: string; status: string } | undefined]

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  if (app.status === 'approved') return NextResponse.json({ error: 'Already approved' }, { status: 409 })

  const signupToken = crypto.randomUUID()

  await db`
    UPDATE org_applications
    SET status = 'approved', signup_token = ${signupToken}, approved_at = NOW()
    WHERE id = ${id}
  `

  try {
    await sendOrgApprovalEmail(app.email, app.org_name, signupToken)
  } catch (err) {
    console.error('Failed to send org approval email:', err)
    return NextResponse.json({ error: 'Approved but email failed to send' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
