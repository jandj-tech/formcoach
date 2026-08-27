import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { FROM } from '@/lib/email-senders'

// Content-report endpoint (App Store guideline 1.2): anyone can flag a
// result page, name, or other user content. Reports go straight to support
// so objectionable content can be removed quickly.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { contentUrl?: string; reason?: string }
    const contentUrl = (body.contentUrl ?? '').toString().slice(0, 500)
    const reason = (body.reason ?? '').toString().slice(0, 2000)
    if (!contentUrl && !reason) {
      return NextResponse.json({ error: 'Nothing to report' }, { status: 400 })
    }

    const resend = new Resend(process.env.RESEND_API_KEY!)
    await resend.emails.send({
      from: FROM,
      to: 'support@learnhoops.com',
      subject: '⚠️ Content report',
      text: [
        'A user reported content on LearnHoops.',
        '',
        `Content: ${contentUrl || '(not provided)'}`,
        `Reason: ${reason || '(not provided)'}`,
        `Reporter UA: ${req.headers.get('user-agent') ?? 'unknown'}`,
        '',
        'Review within 24 hours per our moderation commitment.',
      ].join('\n'),
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Report error:', err)
    return NextResponse.json({ error: 'Could not submit report' }, { status: 500 })
  }
}
