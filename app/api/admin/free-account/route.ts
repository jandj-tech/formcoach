import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cookies } from 'next/headers'
import { Resend } from 'resend'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://learnhoops.com'

async function isAdminAuthed(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

export async function GET() {
  if (!(await isAdminAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accounts = await db`
    SELECT email, subscription_type, subscription_expires_at, created_at
    FROM email_list
    WHERE subscription_type = 'complimentary'
    ORDER BY created_at DESC
  `
  return NextResponse.json({ accounts })
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email } = await req.json() as { email: string }
  if (!email?.trim()) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const normalizedEmail = email.trim().toLowerCase()
  const expiresAt = new Date()
  expiresAt.setFullYear(expiresAt.getFullYear() + 10)

  // Upsert into email_list with complimentary subscription
  await db`
    INSERT INTO email_list (email, subscription_type, subscription_expires_at)
    VALUES (${normalizedEmail}, 'complimentary', ${expiresAt})
    ON CONFLICT (email) DO UPDATE SET
      subscription_type = 'complimentary',
      subscription_expires_at = ${expiresAt}
  `

  // Also upsert into users table if it exists (for dashboard access)
  try {
    await db`
      INSERT INTO users (email, subscription_type, subscription_expires_at)
      VALUES (${normalizedEmail}, 'complimentary', ${expiresAt})
      ON CONFLICT (email) DO UPDATE SET
        subscription_type = 'complimentary',
        subscription_expires_at = ${expiresAt}
    `
  } catch {
    // users table may not have this record yet, that's fine
  }

  // Send welcome email
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'FormCoach <noreply@learnhoops.com>',
      to: normalizedEmail,
      subject: 'You have free access to FormCoach!',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#f97316">You've got free access to FormCoach!</h2>
          <p>Your account has been set up with complimentary unlimited access to FormCoach shot analysis.</p>
          <p>Visit <a href="${BASE_URL}/analyze" style="color:#f97316">${BASE_URL}/analyze</a> to start uploading your shots.</p>
          <p>You can sign up for an account at <a href="${BASE_URL}/signup" style="color:#f97316">${BASE_URL}/signup</a> to access your shot history dashboard.</p>
          <p style="color:#666;font-size:13px">Questions? Just reply to this email.</p>
        </div>
      `,
    })
  } catch (err) {
    console.error('Failed to send welcome email:', err)
    // Non-fatal — account still created
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdminAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email } = await req.json() as { email: string }
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  await db`
    UPDATE email_list
    SET subscription_type = NULL, subscription_expires_at = NULL
    WHERE email = ${email.toLowerCase()}
      AND subscription_type = 'complimentary'
  `

  return NextResponse.json({ success: true })
}
