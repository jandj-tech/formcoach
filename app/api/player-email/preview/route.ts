import { NextRequest, NextResponse } from 'next/server'
import {
  SKIP_DETAIL,
  buildPlayerEmail,
  normalizeContent,
  parseAs,
  parsePicks,
  resolveRecipients,
  resolveSender,
  senderFromHeader,
} from '@/lib/player-email'

// Renders the exact email one real recipient would get. Sends nothing and
// creates no release. The recipient is re-resolved from { teamId, key }.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    as?: unknown
    content?: unknown
    recipient?: unknown
  } | null
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const as = parseAs(body.as)
  if (!as) return NextResponse.json({ error: "as must be 'org' or 'coach'" }, { status: 400 })

  const picks = parsePicks(body.recipient ? [body.recipient] : null)
  if (!picks || picks.length !== 1) return NextResponse.json({ error: 'recipient is required' }, { status: 400 })

  const parsed = normalizeContent(body.content, 'preview')
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const sender = await resolveSender(req, as)
    if (!sender) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const [recipient] = await resolveRecipients(sender, picks, { content: parsed.content })
    if (!recipient || recipient.status === 'not_allowed') {
      return NextResponse.json({ error: 'You can only preview players on your own teams' }, { status: 403 })
    }

    const built = await buildPlayerEmail(sender, recipient, parsed.content)
    return NextResponse.json({
      subject: built.subject,
      html: built.html,
      text: built.text,
      fromHeader: senderFromHeader(sender),
      replyTo: sender.replyTo,
      to: recipient.email,
      includesScore: built.includesScore,
      // Additive: whether this player would actually receive it.
      status: recipient.status,
      statusDetail: recipient.status === 'ok' ? null : SKIP_DETAIL[recipient.status],
      name: recipient.name,
      team: recipient.teamName,
    })
  } catch (err) {
    console.error('[player-email/preview] failed:', err)
    return NextResponse.json({ error: 'Could not render the preview' }, { status: 500 })
  }
}
