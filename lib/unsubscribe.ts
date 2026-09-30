import { createHmac } from 'crypto'
import { resolveBaseUrl } from './base-url'
import { requireEnv, safeEqual } from './env'

/**
 * Signed unsubscribe links.
 *
 * The old link was `/unsubscribe?email=<address>` and a plain GET on it wrote
 * `unsubscribed_at`. Anyone who knew an address could silence it, and that
 * flag doesn't only stop marketing: team announcements, org results emails and
 * filming tips all honour it, so a family could be cut off from their own
 * team's messages by a stranger (or by a link scanner prefetching the URL).
 *
 * Every link we mail now carries `sig`, an HMAC of the address, so the handler
 * can tell a link we sent from one someone typed. The GET side never mutates
 * either way (see app/api/unsubscribe/route.ts); the signature decides whether
 * a POST is trusted outright or has to clear the legacy checks.
 *
 * The key is derived from JWT_SECRET, so no new environment variable. Rotating
 * JWT_SECRET invalidates every signature already mailed; the handler treats an
 * invalid signature exactly like a legacy unsigned link, so old emails keep
 * working through the confirm page rather than breaking.
 */

const SIG_LENGTH = 22

let key: Buffer | undefined
function signingKey(): Buffer {
  if (!key) key = createHmac('sha256', requireEnv('JWT_SECRET')).update('unsubscribe-v1').digest()
  return key
}

/** The canonical form an address is signed and stored under. */
export function normalizeUnsubscribeEmail(email: string | null | undefined): string | null {
  const clean = email?.toLowerCase().trim()
  if (!clean) return null
  // Only plausible addresses: the endpoint is public, so it must not become a
  // way to stuff arbitrary strings into email_list.
  if (clean.length > 254 || !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(clean)) return null
  return clean
}

export function unsubscribeSig(email: string): string {
  return createHmac('sha256', signingKey())
    .update(`unsub:v1:${email.toLowerCase().trim()}`)
    .digest('base64url')
    .slice(0, SIG_LENGTH)
}

/** True only for a signature we issued for exactly this address. */
export function verifyUnsubscribeSig(email: string, sig: string | null | undefined): boolean {
  if (!sig || sig.length !== SIG_LENGTH) return false
  return safeEqual(sig, unsubscribeSig(email))
}

/**
 * The one way to build an unsubscribe link. Used in email bodies, text parts
 * and the List-Unsubscribe header alike: the header's one-click POST lands on
 * this same URL, so it carries the signature too.
 */
export function unsubscribeUrl(email: string): string {
  const params = new URLSearchParams({ email: email.trim(), sig: unsubscribeSig(email) })
  return `${resolveBaseUrl()}/unsubscribe?${params.toString()}`
}

/** `jen.roberts@parents.test` → `j••••••••s@parents.test`, for the confirm page. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) return email
  const local = email.slice(0, at)
  const domain = email.slice(at)
  if (local.length <= 2) return `${local[0]}•${domain}`
  return `${local[0]}${'•'.repeat(Math.min(local.length - 2, 8))}${local[local.length - 1]}${domain}`
}
