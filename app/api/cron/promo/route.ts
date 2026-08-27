import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { activeMarketingRecipients } from '@/lib/email-list'
import { requireEnv, safeEqual } from '@/lib/env'
import { sendPromoEmail } from '@/lib/email'

export const maxDuration = 300

// Monthly promotional email (1st of the month) to every signed-up (not
// unsubscribed) address. Scheduled in vercel.json.
export async function GET(req: NextRequest) {
  // requireEnv rather than reading CRON_SECRET directly: with the variable
  // unset, the old comparison accepted the literal header "Bearer undefined".
  const authHeader = req.headers.get('authorization')
  if (!safeEqual(authHeader, `Bearer ${requireEnv('CRON_SECRET')}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Shared filter: skips unsubscribes, hard bounces and spam complaints.
  // This used to be a local "WHERE unsubscribed_at IS NULL", which meant
  // every dead address on the list got mailed again every single month.
  const recipients = await activeMarketingRecipients()

  let sent = 0
  let failed = 0

  // Paced in chunks rather than one unbroken burst. A few hundred messages
  // arriving at a provider in one continuous stream from a domain that sends
  // monthly reads as a blast; it also keeps us under Resend rate limits.
  const CHUNK_SIZE = 50
  const PAUSE_MS = 1000
  for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
    const chunk = recipients.slice(i, i + CHUNK_SIZE)
    for (const r of chunk) {
      try {
        await sendPromoEmail(r.email)
        await db`INSERT INTO email_logs (email, email_type) VALUES (${r.email}, 'promo')`
        sent++
      } catch {
        failed++
      }
    }
    if (i + CHUNK_SIZE < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS))
    }
  }

  return NextResponse.json({ sent, failed, total: recipients.length })
}
