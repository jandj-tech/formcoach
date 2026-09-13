import { db } from '@/lib/db'

// Add an account's email to the marketing list. ON CONFLICT DO NOTHING keeps
// an existing row untouched — critically, someone who unsubscribed earlier
// stays unsubscribed (unsubscribed_at is preserved). Every marketing email
// carries an unsubscribe link, and the send crons skip unsubscribed rows.
// Never throws: signup must succeed even if the list insert fails.
export async function addToEmailList(email: string | null | undefined): Promise<void> {
  const emailLower = email?.toLowerCase().trim()
  if (!emailLower) return
  try {
    await db`
      INSERT INTO email_list (email)
      VALUES (${emailLower})
      ON CONFLICT (email) DO NOTHING
    `
  } catch (err) {
    console.error('[email-list] failed to add email:', err)
  }
}

/**
 * Everyone eligible to receive bulk mail right now.
 *
 * Three exclusions, and all three matter to deliverability:
 *  - unsubscribed_at: they asked us to stop.
 *  - bounced_at: the mailbox does not exist. Continuing to send to it is what
 *    turns a good sending reputation into a bad one.
 *  - complained_at: they pressed "report spam". Never mail them again.
 *
 * Every bulk sender must go through this rather than writing its own WHERE
 * clause -- the promo cron, the drip cron and admin broadcasts previously each
 * had their own, and only one of them was ever updated at a time.
 */
export async function activeMarketingRecipients(): Promise<Array<{ email: string }>> {
  return (await db`
    SELECT email
    FROM email_list
    WHERE unsubscribed_at IS NULL
      AND bounced_at IS NULL
      AND complained_at IS NULL
  `) as unknown as Array<{ email: string }>
}

/** As above, plus the drip position, for the 5-email marketing sequence. */
export async function activeDripRecipients(
  maxEmails: number,
  batchSize = dripBatchSize()
): Promise<Array<{ email: string; marketing_emails_sent: number }>> {
  return (await db`
    SELECT email, marketing_emails_sent
    FROM email_list
    WHERE unsubscribed_at IS NULL
      AND bounced_at IS NULL
      AND complained_at IS NULL
      AND marketing_emails_sent < ${maxEmails}
    ORDER BY marketing_emails_sent ASC, created_at ASC
    LIMIT ${batchSize}
  `) as unknown as Array<{ email: string; marketing_emails_sent: number }>
}

/**
 * How many drip emails one cron run may send.
 *
 * Unbounded, this returns every eligible address at once, and the first run
 * after the cron is scheduled would be the largest send this domain has ever
 * made — a good way to teach inbox providers that we arrive in bursts. Pacing
 * it is domain warm-up, not politeness. /api/cron/promo chunks for the same
 * reason.
 *
 * `ORDER BY marketing_emails_sent ASC` is the other half: least-served first,
 * so everyone receives email 1 before anyone receives email 2. Ordering by
 * created_at alone would march the oldest signups through all five while the
 * tail of the list never heard from us at all.
 */
const DEFAULT_DRIP_BATCH = 25

export function dripBatchSize(): number {
  const raw = Number(process.env.DRIP_BATCH_SIZE)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_DRIP_BATCH
}

/**
 * A hard bounce: the address is not deliverable. Suppress it permanently.
 * Only hard bounces land here -- a soft bounce (full mailbox, greylisting) is
 * transient and suppressing on one would lose real recipients.
 */
export async function suppressBounced(email: string): Promise<void> {
  const clean = email?.toLowerCase().trim()
  if (!clean) return
  await db`
    UPDATE email_list
    SET bounced_at = NOW()
    WHERE email = ${clean} AND bounced_at IS NULL
  `
}

/** A spam report. The most damaging signal we can receive; suppress on sight. */
export async function suppressComplained(email: string): Promise<void> {
  const clean = email?.toLowerCase().trim()
  if (!clean) return
  await db`
    UPDATE email_list
    SET complained_at = NOW(), unsubscribed_at = COALESCE(unsubscribed_at, NOW())
    WHERE email = ${clean} AND complained_at IS NULL
  `
}
