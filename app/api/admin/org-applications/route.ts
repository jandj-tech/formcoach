import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendOrgApprovalEmail, orgSignupLink } from '@/lib/email'
import { isAdminSession } from '@/lib/admin-auth'

async function isAdminAuthed(): Promise<boolean> {
  return isAdminSession()
}

type ApplicationRow = {
  id: string
  org_name: string
  email: string
  status: string
  signup_token: string | null
}

export async function GET() {
  if (!(await isAdminAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db`
    SELECT id, org_name, email, player_count, status, created_at, approved_at, signup_token
    FROM org_applications
    ORDER BY created_at DESC
    LIMIT 200
  ` as unknown as (ApplicationRow & { player_count: number | null; created_at: string; approved_at: string | null })[]

  // Surface the link itself so an approved org can always be helped by hand
  // when email delivery fails or the message lands in spam.
  const applications = rows.map(({ signup_token, ...rest }) => ({
    ...rest,
    signupLink: signup_token ? orgSignupLink(signup_token) : null,
  }))

  return NextResponse.json({ applications })
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const [app] = await db`
    SELECT id, org_name, email, status, signup_token FROM org_applications WHERE id = ${id}
  ` as unknown as [ApplicationRow | undefined]

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  if (app.status === 'registered') {
    return NextResponse.json({ error: 'This organization already created its account.' }, { status: 409 })
  }

  // Approving twice is a resend, not an error: the first email may never have
  // arrived. Reuse the existing token so a link already sitting in the inbox
  // keeps working.
  const resend = app.status === 'approved' && !!app.signup_token
  const signupToken = resend ? app.signup_token! : crypto.randomUUID()

  if (!resend) {
    await db`
      UPDATE org_applications
      SET status = 'approved', signup_token = ${signupToken}, approved_at = NOW()
      WHERE id = ${id}
    `
  }

  const signupLink = orgSignupLink(signupToken)

  // The approval is already committed, so a failed send is reported rather
  // than thrown — the admin still gets the link to pass on by hand.
  try {
    await sendOrgApprovalEmail(app.email, app.org_name, signupToken)
  } catch (err) {
    console.error('Failed to send org approval email:', err)
    return NextResponse.json({
      success: true,
      resend,
      emailSent: false,
      emailError: err instanceof Error ? err.message : 'Email failed to send',
      signupLink,
    })
  }

  return NextResponse.json({ success: true, resend, emailSent: true, signupLink })
}
