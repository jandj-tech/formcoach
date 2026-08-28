import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
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

  // Only address anyone who has NOT already received a promo in the current
  // cycle. This is the idempotency the loop was missing: a re-hit, an
  // overlapping run, or a run that timed out partway (sequential sends,
  // maxDuration=300) would otherwise re-blast everyone already emailed. The
  // 20-day window is safely inside the monthly cadence — it blocks same-cycle
  // duplicates while never suppressing next month's send. The email_logs row is
  // written immediately after each send so a resumed run skips it.
  const recipients = (await db`
    SELECT el.email FROM email_list el
    WHERE el.unsubscribed_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM email_logs lg
        WHERE lg.email = el.email
          AND lg.email_type = 'promo'
          AND lg.sent_at > NOW() - INTERVAL '20 days'
      )
  `) as unknown as Array<{ email: string }>

  let sent = 0
  let failed = 0

  for (const r of recipients) {
    try {
      await sendPromoEmail(r.email)
      await db`INSERT INTO email_logs (email, email_type) VALUES (${r.email}, 'promo')`
      sent++
    } catch {
      failed++
    }
  }

  return NextResponse.json({ sent, failed, total: recipients.length })
}
