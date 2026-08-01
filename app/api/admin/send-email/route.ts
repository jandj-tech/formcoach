import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import {
  renderBroadcastHtml,
  sendBroadcast,
  type BroadcastContent,
} from '@/lib/broadcast-email'

// Sending a big list takes a while even with batching — allow up to 60s.
export const maxDuration = 60

async function isAdmin() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

export type Audience = 'all' | 'players' | 'coaches' | 'orgs' | 'single'

// Resolve an audience to subscribed email addresses. Everything intersects
// email_list WHERE unsubscribed_at IS NULL, so an unsubscribe is always
// honored no matter which audience is picked.
async function resolveRecipients(audience: Audience, singleEmail?: string): Promise<string[]> {
  if (audience === 'single') {
    const email = singleEmail?.toLowerCase().trim()
    if (!email) return []
    const rows = await db`
      SELECT email FROM email_list
      WHERE email = ${email} AND unsubscribed_at IS NULL
    ` as unknown as Array<{ email: string }>
    return rows.map(r => r.email)
  }

  if (audience === 'players') {
    const rows = await db`
      SELECT DISTINCT el.email FROM email_list el
      JOIN users u ON LOWER(u.email) = el.email
      WHERE el.unsubscribed_at IS NULL
    ` as unknown as Array<{ email: string }>
    return rows.map(r => r.email)
  }

  if (audience === 'coaches') {
    const rows = await db`
      SELECT DISTINCT el.email FROM email_list el
      WHERE el.unsubscribed_at IS NULL
        AND (
          EXISTS (SELECT 1 FROM teams t WHERE LOWER(t.admin_email) = el.email)
          OR EXISTS (SELECT 1 FROM team_coaches tc WHERE LOWER(tc.email) = el.email)
        )
    ` as unknown as Array<{ email: string }>
    return rows.map(r => r.email)
  }

  if (audience === 'orgs') {
    const rows = await db`
      SELECT DISTINCT el.email FROM email_list el
      JOIN organizations o ON LOWER(o.admin_email) = el.email
      WHERE el.unsubscribed_at IS NULL
    ` as unknown as Array<{ email: string }>
    return rows.map(r => r.email)
  }

  const rows = await db`
    SELECT email FROM email_list WHERE unsubscribed_at IS NULL
  ` as unknown as Array<{ email: string }>
  return rows.map(r => r.email)
}

type Body = {
  action: 'preview' | 'send' | 'test'
  audience: Audience
  singleEmail?: string
  testEmail?: string
  subject?: string
  headline?: string
  body?: string
  ctaText?: string
  ctaUrl?: string
}

function validateContent(b: Body): BroadcastContent | { error: string } {
  const subject = b.subject?.trim()
  const headline = b.headline?.trim()
  const bodyText = b.body?.trim()
  if (!subject) return { error: 'Subject is required' }
  if (!headline) return { error: 'Headline is required' }
  if (!bodyText) return { error: 'Body is required' }
  const ctaText = b.ctaText?.trim() || undefined
  const ctaUrl = b.ctaUrl?.trim() || undefined
  if ((ctaText && !ctaUrl) || (!ctaText && ctaUrl)) {
    return { error: 'Button needs both a label and a link (or leave both blank)' }
  }
  if (ctaUrl && !/^https?:\/\//i.test(ctaUrl)) {
    return { error: 'Button link must start with http:// or https://' }
  }
  return { subject, headline, body: bodyText, ctaText, ctaUrl }
}

export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as Body
  const content = validateContent(body)
  if ('error' in content) return NextResponse.json({ error: content.error }, { status: 400 })

  if (body.action === 'preview') {
    const recipients = await resolveRecipients(body.audience, body.singleEmail)
    return NextResponse.json({
      subject: content.subject,
      html: renderBroadcastHtml(content, body.singleEmail || 'player@example.com'),
      recipientCount: recipients.length,
    })
  }

  if (body.action === 'test') {
    const testEmail = body.testEmail?.toLowerCase().trim()
    if (!testEmail) return NextResponse.json({ error: 'Test email address required' }, { status: 400 })
    const result = await sendBroadcast(content, [testEmail])
    if (result.failed > 0) {
      return NextResponse.json({ error: `Test send failed: ${result.errors[0] ?? 'unknown error'}` }, { status: 500 })
    }
    return NextResponse.json({ success: true, sent: 1 })
  }

  // action === 'send'
  const recipients = await resolveRecipients(body.audience, body.singleEmail)
  if (recipients.length === 0) {
    return NextResponse.json({ error: 'No subscribed recipients match that audience' }, { status: 400 })
  }

  const result = await sendBroadcast(content, recipients)

  // Log sends so the history is auditable (best-effort).
  try {
    for (const email of recipients) {
      await db`INSERT INTO email_logs (email, email_type) VALUES (${email}, 'broadcast')`
    }
  } catch (err) {
    console.error('[broadcast] failed to log sends:', err)
  }

  return NextResponse.json({
    success: result.failed === 0,
    sent: result.sent,
    failed: result.failed,
    errors: result.errors.slice(0, 3),
  })
}
