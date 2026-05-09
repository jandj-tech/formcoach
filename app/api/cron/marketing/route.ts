import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendNextMarketingEmail } from '@/lib/email'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  // Protect cron endpoint — Vercel sets this header automatically
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const eligible = await db`
    SELECT email, marketing_emails_sent
    FROM email_list
    WHERE unsubscribed_at IS NULL
    AND marketing_emails_sent < 5
  `

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
