import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendResultsEmail } from '@/lib/email'
import { rateLimit, rateLimitByIp } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const { email, submissionId } = await req.json()

    if (!email || !submissionId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const emailLower = email.toLowerCase().trim()

    // Unauthenticated (the results page emails itself after an anonymous
    // analysis), so it is a Resend cost/spam vector — throttle per IP and per
    // target email before sending anything.
    const perIp = await rateLimitByIp(req, 'submit-email', 20, 3600)
    const perEmail = await rateLimit(`submit-email:${emailLower}`, 10, 3600)
    if (!perIp.ok || !perEmail.ok) {
      const retry = Math.max(perIp.retryAfterSeconds, perEmail.retryAfterSeconds)
      return NextResponse.json(
        { error: 'Too many requests — please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retry) } },
      )
    }

    // Check token balance / active subscription
    const [emailRow] = await db`
      SELECT subscription_type, subscription_expires_at, analysis_tokens
      FROM email_list WHERE email = ${emailLower}
    `

    const isSubscribed =
      !!emailRow?.subscription_type &&
      !!emailRow?.subscription_expires_at &&
      new Date(emailRow.subscription_expires_at) > new Date()

    const tokens: number = emailRow?.analysis_tokens ?? 0

    if (!isSubscribed && tokens <= 0) {
      return NextResponse.json({ error: 'no_tokens' }, { status: 402 })
    }

    // Deduct one token (subscribed accounts are unlimited). Both debits carry
    // `AND analysis_tokens > 0` so concurrent requests can never drive a
    // balance negative — the guard the email_list debit was missing.
    if (!isSubscribed) {
      await db`
        UPDATE email_list SET analysis_tokens = analysis_tokens - 1
        WHERE email = ${emailLower} AND analysis_tokens > 0
      `
      await db`
        UPDATE users SET analysis_tokens = analysis_tokens - 1
        WHERE email = ${emailLower} AND analysis_tokens > 0
      `
    }

    // Fetch submission + its token
    const [submission] = await db`
      SELECT id, token, status FROM submissions WHERE id = ${submissionId}
    `

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    // Update submission with email
    await db`
      UPDATE submissions SET email = ${emailLower} WHERE id = ${submissionId}
    `

    // Upsert to email list
    await db`
      INSERT INTO email_list (email)
      VALUES (${emailLower})
      ON CONFLICT (email) DO NOTHING
    `

    // Log transactional email
    await db`
      INSERT INTO email_logs (email, email_type)
      VALUES (${emailLower}, 'results')
    `

    // Send results email
    await sendResultsEmail(emailLower, submission.token)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Submit email error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
