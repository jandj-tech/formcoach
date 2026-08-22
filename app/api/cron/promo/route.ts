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

  const recipients = (await db`
    SELECT email FROM email_list WHERE unsubscribed_at IS NULL
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
