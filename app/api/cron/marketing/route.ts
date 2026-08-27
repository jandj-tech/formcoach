import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { activeDripRecipients } from '@/lib/email-list'
import { requireEnv, safeEqual } from '@/lib/env'
import { sendNextMarketingEmail } from '@/lib/email'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  // Protect cron endpoint — Vercel sets this header automatically
  // requireEnv rather than reading CRON_SECRET directly: with the variable
  // unset, the old comparison accepted the literal header "Bearer undefined".
  const authHeader = req.headers.get('authorization')
  if (!safeEqual(authHeader, `Bearer ${requireEnv('CRON_SECRET')}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 5 is the length of the drip sequence in lib/email.ts. The shared filter
  // also drops hard bounces and anyone who reported us as spam.
  const DRIP_LENGTH = 5
  const eligible = await activeDripRecipients(DRIP_LENGTH)

  let sent = 0
  let failed = 0

  for (const row of eligible) {
    try {
      const wasSent = await sendNextMarketingEmail(row.email, row.marketing_emails_sent)
      if (wasSent) {
        await db`
          UPDATE email_list
          SET marketing_emails_sent = marketing_emails_sent + 1
          WHERE email = ${row.email}
        `
        await db`
          INSERT INTO email_logs (email, email_type)
          VALUES (${row.email}, ${'marketing_' + (row.marketing_emails_sent + 1)})
        `
        sent++
      }
    } catch {
      failed++
    }
  }

  return NextResponse.json({ sent, failed, total: eligible.length })
}
