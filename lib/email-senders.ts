/**
 * Who our mail comes from, and who a reply reaches.
 *
 * Two deliberate decisions live here, both of them deliverability fixes:
 *
 * 1. No `noreply@`. Every send in this repo used to go out as
 *    `noreply@learnhoops.com` AND set that same address as Reply-To. A reply is
 *    one of the strongest positive engagement signals a mailbox provider has,
 *    and we were throwing it away — worse, anyone who did reply got a bounce,
 *    because nothing receives at `noreply@`.
 *
 * 2. Marketing does not share a From address with transactional mail. Spam
 *    complaints attach to the sending domain, so a promo blast that annoys
 *    people was dragging password resets and shot-analysis results down with
 *    it. Marketing rides its own subdomain, which is verified separately in
 *    Resend and carries its own reputation. If the promo stream gets
 *    complaints, resets still land.
 *
 * Both are env-overridable so a mailbox rename doesn't need a deploy.
 */

/**
 * The public reply address, shown to every recipient. It is on the domain on
 * purpose: a personal gmail.com address in Reply-To tells every customer, coach
 * and parent what the owner's private inbox is, and it cannot be changed later
 * without breaking every reply thread already in flight.
 *
 * IMPORTANT: this address must FORWARD somewhere. It does not host a mailbox of
 * its own today, so until inbound forwarding is configured (ImprovMX or
 * Cloudflare Email Routing, both free, or a Workspace mailbox) a reply to it
 * will bounce. A bounced reply is worse than an exposed address, so set the
 * forwarding up before shipping this to a real send.
 */
export const REPLY_TO = process.env.SUPPORT_EMAIL || 'support@learnhoops.com'

/**
 * Where the app mails ITSELF: content reports, chat reports, support-form
 * submissions. Never appears in a customer-facing header, so a gmail.com
 * address here exposes nothing — and unlike the domain, it demonstrably
 * receives mail today, which is what an alert has to do.
 */
export const INTERNAL_INBOX = process.env.INTERNAL_EMAIL || 'learnhoops8@gmail.com'

/**
 * Transactional sender: results, password resets, invites, orders, receipts.
 *
 * Must be an address on a Resend-verified domain -- that is what lets DKIM sign
 * as learnhoops.com and align with the From header a recipient sees. It does not
 * have to be a mailbox that receives (bounces go to the Return-Path, and replies
 * go to REPLY_TO), though creating it is worth doing.
 */
export const FROM = process.env.EMAIL_FROM || 'LearnHoops <support@learnhoops.com>'

/**
 * Marketing sender: the monthly promo, the 5-email drip, admin broadcasts.
 *
 * Defaults to the transactional address, NOT to a marketing subdomain. Resend
 * rejects any send from a domain it has not verified, so defaulting to
 * `news.learnhoops.com` before that subdomain exists would fail every
 * marketing send — silently, because both send crons swallow per-address
 * errors into a `failed` counter.
 *
 * To get the reputation split, verify a subdomain in Resend, publish its three
 * DNS records, then set MARKETING_EMAIL_FROM to an address on it. Until that is
 * done the mail still goes out; it just shares reputation with transactional.
 */
export const MARKETING_FROM = process.env.MARKETING_EMAIL_FROM || FROM
