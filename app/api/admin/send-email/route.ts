import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminSession } from '@/lib/admin-auth'
import {
  renderBroadcastHtml,
  sendBroadcast,
  type BroadcastContent,
  type BroadcastRecipient,
} from '@/lib/broadcast-email'

// Sending a big list takes a while even with batching — allow up to 60s.
export const maxDuration = 60

async function isAdmin() {
  return isAdminSession()
}

export type Audience = 'all' | 'players' | 'coaches' | 'orgs' | 'single'

// Resolve an audience to subscribed recipients with a best-effort name for
// the {{name}} token (player first name/nickname, coach nickname, org name).
// Everything intersects the `sendable` predicate below, so an unsubscribe, a
// hard bounce and a spam complaint are all honored no matter which audience is
// picked.
async function resolveRecipients(audience: Audience, singleEmail?: string): Promise<BroadcastRecipient[]> {
  type Row = { email: string; name: string | null }

  // Who may receive bulk mail. Every audience below intersects this, so an
  // unsubscribe, a hard bounce and a spam complaint are all honored no matter
  // which audience the admin picks -- previously each branch carried its own
  // copy of "unsubscribed_at IS NULL" and none of them knew about bounces.
  const sendable = db`
    el.unsubscribed_at IS NULL
    AND el.bounced_at IS NULL
    AND el.complained_at IS NULL
  `

  // Best-effort display name for any address, in priority order:
  // player first name → player nickname → coach nickname → org name.
  const nameSql = db`
    COALESCE(
      (SELECT COALESCE(u.first_name, u.nickname) FROM users u WHERE LOWER(u.email) = el.email LIMIT 1),
      (SELECT tc.nickname FROM team_coaches tc WHERE LOWER(tc.email) = el.email AND tc.nickname IS NOT NULL LIMIT 1),
      (SELECT t.coach_nickname FROM teams t WHERE LOWER(t.admin_email) = el.email AND t.coach_nickname IS NOT NULL LIMIT 1),
      (SELECT o.name FROM organizations o WHERE LOWER(o.admin_email) = el.email LIMIT 1)
    )
  `

  if (audience === 'single') {
    const email = singleEmail?.toLowerCase().trim()
    if (!email) return []
    return (await db`
      SELECT el.email, ${nameSql} AS name FROM email_list el
      WHERE el.email = ${email} AND ${sendable}
    `) as unknown as Row[]
  }

  if (audience === 'players') {
    return (await db`
      SELECT DISTINCT el.email, ${nameSql} AS name FROM email_list el
      JOIN users u ON LOWER(u.email) = el.email
      WHERE ${sendable}
    `) as unknown as Row[]
  }

  if (audience === 'coaches') {
    return (await db`
      SELECT DISTINCT el.email, ${nameSql} AS name FROM email_list el
      WHERE ${sendable}
        AND (
          EXISTS (SELECT 1 FROM teams t WHERE LOWER(t.admin_email) = el.email)
          OR EXISTS (SELECT 1 FROM team_coaches tc WHERE LOWER(tc.email) = el.email)
        )
    `) as unknown as Row[]
  }

  if (audience === 'orgs') {
    return (await db`
      SELECT DISTINCT el.email, ${nameSql} AS name FROM email_list el
      JOIN organizations o ON LOWER(o.admin_email) = el.email
      WHERE ${sendable}
    `) as unknown as Row[]
  }

  return (await db`
    SELECT el.email, ${nameSql} AS name FROM email_list el
    WHERE ${sendable}
  `) as unknown as Row[]
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
    // Preview renders for the first real recipient when there is one, so the
    // {{name}} personalization shown matches an actual send; sample otherwise.
    const sample: BroadcastRecipient = recipients[0] ?? { email: 'player@example.com', name: 'Jordan' }
    return NextResponse.json({
      subject: content.subject.replace(/\{\{\s*name\s*\}\}/gi, sample.name?.trim() || 'there'),
      html: renderBroadcastHtml(content, sample),
      recipientCount: recipients.length,
      sampleName: sample.name?.trim() || 'there',
    })
  }

  if (body.action === 'test') {
    const testEmail = body.testEmail?.toLowerCase().trim()
    if (!testEmail) return NextResponse.json({ error: 'Test email address required' }, { status: 400 })
    // Sample name so the tester sees the {{name}} personalization in action.
    const result = await sendBroadcast(content, [{ email: testEmail, name: 'Jordan' }])
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

  // Log sends so the history is auditable (best-effort). ONE bulk insert, not a
  // per-recipient loop: for a few thousand recipients the old N+1 loop could
  // blow past maxDuration=60 *after* the emails had already gone out, so the
  // function was killed, the admin saw a failure, and re-sent — duplicating the
  // whole broadcast. A single round-trip removes that timeout-after-send risk.
  try {
    const logRows = recipients.map((r) => ({ email: r.email, email_type: 'broadcast' }))
    await db`INSERT INTO email_logs ${db(logRows, 'email', 'email_type')}`
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
