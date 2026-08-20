import { db } from './db'
import { sendFilmingTipsEmail } from './email'

/**
 * Whether to tell this viewer, on this report, that a filming email is waiting.
 *
 * Three conditions, all required, because the claim is specific and a results
 * link is shareable:
 *
 *   - the viewer owns this report (a stranger opening the link must not be
 *     told to check an inbox that is not theirs),
 *   - the email was actually LOGGED as sent to them, so an unsubscribed or
 *     failed send never produces a notice pointing at an email that isn't
 *     there,
 *   - and this is still their only analysis, which is what makes it "your
 *     first".
 *
 * Never throws: a report must render even if this lookup fails.
 */
export async function shouldShowInboxNotice(args: {
  viewerUserId?: string | null
  viewerEmail?: string | null
  ownerUserId?: string | null
}): Promise<boolean> {
  const { viewerUserId, viewerEmail, ownerUserId } = args
  if (!viewerUserId || !ownerUserId || viewerUserId !== ownerUserId) return false
  const email = viewerEmail?.trim().toLowerCase()
  if (!email) return false

  try {
    const [row] = (await db`
      SELECT
        (
          SELECT count(*)::int
          FROM submissions s
          JOIN analyses a ON a.submission_id = s.id
          WHERE s.user_id = ${ownerUserId}
        ) AS analyses,
        EXISTS (
          SELECT 1 FROM email_logs
          WHERE lower(email) = ${email} AND email_type = 'filming_tips'
        ) AS mailed
    `) as unknown as [{ analyses: number; mailed: boolean } | undefined]
    return !!row && row.analyses <= 1 && row.mailed
  } catch (err) {
    console.error('[filming-tips] inbox notice check failed:', err)
    return false
  }
}

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
