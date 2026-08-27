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
 * Where replies land, and where the app sends its own internal alerts.
 *
 * This MUST be a mailbox that actually accepts mail. It previously pointed at
 * `support@learnhoops.com`, which does not exist -- Resend has that address on
 * its suppression list from an earlier hard bounce, so every content report the
 * app "sent to support" was silently discarded, and any customer who replied to
 * one of our emails got a bounce. That is the precise failure this constant was
 * introduced to eliminate.
 *
 * Point SUPPORT_EMAIL at a mailbox on learnhoops.com once one exists; a From
 * and Reply-To on the same domain reads better than a gmail.com reply address.
 * Until then, a working inbox beats a tidy-looking dead one.
 */
export const REPLY_TO = process.env.SUPPORT_EMAIL || 'learnhoops8@gmail.com'

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
