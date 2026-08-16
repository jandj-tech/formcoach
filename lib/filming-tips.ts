import { db } from './db'
import { sendFilmingTipsEmail } from './email'

/**
 * Sends the filming guide to someone who has just had their first analysis
 * graded — once, ever.
 *
 * The slot is CLAIMED before the email is sent, not after. If the send then
 * fails, that person never gets it; if it were the other way round, a timeout
 * on Resend's side could produce two. A missing email is a small loss and a
 * duplicate is an annoying one, so the claim goes first.
 *
 * Never throws: an analysis must not fail because an email did.
 */
export async function maybeSendFilmingTips(email: string | null | undefined): Promise<void> {
  const to = email?.trim().toLowerCase()
  if (!to || !to.includes('@')) return

  try {
    const [optedOut] = (await db`
      SELECT 1 AS x FROM email_list
      WHERE email = ${to} AND unsubscribed_at IS NOT NULL
    `) as unknown as [{ x: number } | undefined]
    if (optedOut) return

    // The partial unique index on (email) WHERE email_type = 'filming_tips'
    // makes this the atomic claim: exactly one caller gets a row back.
    const [claimed] = (await db`
      INSERT INTO email_logs (email, email_type)
      VALUES (${to}, 'filming_tips')
      ON CONFLICT DO NOTHING
      RETURNING id
    `) as unknown as [{ id: number } | undefined]
    if (!claimed) return

    await sendFilmingTipsEmail(to)
  } catch (err) {
    console.error('[filming-tips] send skipped:', err)
  }
}
