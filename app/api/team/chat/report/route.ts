import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { db } from '@/lib/db'
import { resolveChatActorFromRequest } from '@/lib/team-chat'

// Report a chat message (App Store guideline 1.2). The message is flagged to
// support with full context; reports are reviewed within 24 hours.
export async function POST(req: NextRequest) {
  const p = await req.json().catch(() => ({})) as { messageId?: number; reason?: string }
  if (!p.messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 })

  try {
    const [msg] = (await db`
      SELECT m.id, m.team_id, m.sender_name, m.body, t.name AS team_name
      FROM team_messages m JOIN teams t ON t.id = m.team_id
      WHERE m.id = ${p.messageId}
    `) as unknown as [{ id: number; team_id: string; sender_name: string; body: string; team_name: string } | undefined]
    if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 })

    const actor = await resolveChatActorFromRequest(req, msg.team_id)
    if (!actor) return NextResponse.json({ error: 'Login required' }, { status: 401 })

    const resend = new Resend(process.env.RESEND_API_KEY!)
    await resend.emails.send({
      from: 'LearnHoops <noreply@learnhoops.com>',
      to: 'support@learnhoops.com',
      subject: '⚠️ Chat message report',
      text: [
        'A team chat message was reported.',
        '',
        `Team: ${msg.team_name} (${msg.team_id})`,
        `Message #${msg.id} from ${msg.sender_name}:`,
        `"${msg.body}"`,
        '',
        `Reason: ${(p.reason ?? '').toString().slice(0, 500) || '(not provided)'}`,
        `Reported by: ${actor.email}`,
        '',
        'Review within 24 hours per our moderation commitment.',
      ].join('\n'),
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[team/chat/report] failed:', err)
    return NextResponse.json({ error: 'Could not submit report' }, { status: 500 })
  }
}
