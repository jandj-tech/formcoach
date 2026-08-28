import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { rateLimit, rateLimitByIp } from '@/lib/rate-limit'

// Content-report endpoint (App Store guideline 1.2): anyone can flag a
// result page, name, or other user content. Reports go straight to support
// so objectionable content can be removed quickly.
//
// This is intentionally unauthenticated (a signed-out viewer of a shared
// result must be able to flag it), so it is a Resend cost/spam vector. Two
// fixed windows blunt that: a per-IP cap so one machine can't loop it, and a
// global cap so a distributed flood still can't bury the abuse inbox or run up
// the email bill. Both fail open (see lib/rate-limit.ts) so a limiter outage
// never blocks a genuine report.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { contentUrl?: string; reason?: string }
    const contentUrl = (body.contentUrl ?? '').toString().slice(0, 500)
    const reason = (body.reason ?? '').toString().slice(0, 2000)
    if (!contentUrl && !reason) {
      return NextResponse.json({ error: 'Nothing to report' }, { status: 400 })
    }

    const perIp = await rateLimitByIp(req, 'report', 5, 3600)
    if (!perIp.ok) {
      return NextResponse.json(
        { error: 'You have sent several reports recently — please try again later.' },
        { status: 429, headers: { 'Retry-After': String(perIp.retryAfterSeconds) } },
      )
    }
    const global = await rateLimit('report:global', 300, 3600)
    if (!global.ok) {
      return NextResponse.json(
        { error: 'Reporting is temporarily busy — please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(global.retryAfterSeconds) } },
      )
    }

    const resend = new Resend(process.env.RESEND_API_KEY!)
    await resend.emails.send({
      from: 'LearnHoops <noreply@learnhoops.com>',
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
