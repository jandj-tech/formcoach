/**
 * Who our mail comes from, and whether a reply is invited.
 *
 * Three streams, deliberately separate, because they get judged separately:
 *
 *  1. NOTIFICATION_FROM - automated mail the product sends because the
 *     recipient did something: shot analysis ready, filming tips, password
 *     reset, order and shipping confirmations, team invites, account notices.
 *     Sent from noreply@ and carrying NO Reply-To, because support is handled
 *     through the form at /support rather than by replying to a robot. That is
 *     a product decision, not a deliverability one: noreply@ is an ordinary
 *     choice for notifications and does not by itself hurt placement. What
 *     WOULD hurt is an address that hard-bounces, so noreply@learnhoops.com
 *     still needs to be a real forwarding alias.
 *
 *  2. MARKETING_FROM - mail we are selling with: the monthly promo, the drip,
 *     abandoned checkout, admin broadcasts. Only these carry the
 *     List-Unsubscribe headers that declare a message bulk. Measured on this
 *     domain: identical branded HTML landed in the inbox without those headers
 *     and in spam with them, so the declaration is reserved for mail that
 *     genuinely needs it.
 *
 *  3. SUPPORT_ADDRESS - the one address a human is meant to reach us at, and
 *     the only one that has to receive. Reply-To on marketing (a bounced
 *     "unsubscribe me" reply turns into a spam report, the worst outcome
 *     available) and the identity to answer support requests from.
 *
 * INTERNAL_INBOX is separate again: where the app mails ITSELF, never in a
 * customer-facing header.
 */

/** Automated product notifications. Replies are not invited. */
export const NOTIFICATION_FROM = process.env.EMAIL_FROM || 'LearnHoops <noreply@learnhoops.com>'

/**
 * The one repliable address. Must accept mail: it is the Reply-To on marketing
 * and the From when answering a support request.
 */
export const SUPPORT_ADDRESS = process.env.SUPPORT_EMAIL || 'support@learnhoops.com'

/**
 * Sender for mail that WANTS a reply. Coaching and help content sits here
 * rather than under noreply@: "my video will not upload" is a reply we want
 * to receive, and a reply is also one of the strongest positive signals a
 * mailbox provider reads. Replies reach the same inbox as the support form.
 */
export const SUPPORT_FROM = `LearnHoops <${SUPPORT_ADDRESS}>`

/**
 * Marketing sender. Defaults to the notification sender, NOT to a marketing
 * subdomain: Resend rejects any send from a domain it has not verified, and
 * defaulting to an unverified news.learnhoops.com would fail every marketing
 * send silently, since both send crons swallow per-address errors into a
 * failed counter.
 *
 * Verify a subdomain in Resend, publish its three DNS records, then set
 * MARKETING_EMAIL_FROM to an address on it. That split is what stops a spam
 * complaint on a promo from degrading password-reset delivery.
 */
export const MARKETING_FROM = process.env.MARKETING_EMAIL_FROM || NOTIFICATION_FROM

/**
 * Where the app mails ITSELF: content reports, chat reports, support-form
 * submissions. Never in a customer-facing header, so a personal address here
 * exposes nothing - and unlike the domain it demonstrably receives mail today,
 * which is the one thing an alert has to do.
 */
export const INTERNAL_INBOX = process.env.INTERNAL_EMAIL || 'learnhoops8@gmail.com'

/**
 * The senders the admin broadcast composer offers.
 *
 * Resolved on the server only. The browser sends an id, never an address, so
 * a client bundle cannot see or mis-resolve the configured addresses -- the
 * env overrides above are server-side and would read as undefined there.
 */
export type SenderId = 'marketing' | 'support' | 'notification'

export const SENDER_OPTIONS: ReadonlyArray<{ id: SenderId; from: string }> = [
  { id: 'marketing', from: MARKETING_FROM },
  { id: 'support', from: SUPPORT_FROM },
  { id: 'notification', from: NOTIFICATION_FROM },
]

/** Falls back to marketing: an unknown id must never send as noreply@. */
export function resolveSender(id: string | undefined): { id: SenderId; from: string } {
  return SENDER_OPTIONS.find((o) => o.id === id) ?? SENDER_OPTIONS[0]
}
