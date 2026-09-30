import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { normalizeUnsubscribeEmail, verifyUnsubscribeSig } from '@/lib/unsubscribe'

/**
 * Unsubscribe endpoint, served at both /unsubscribe (the URL in every email and
 * List-Unsubscribe header) and /api/unsubscribe.
 *
 *  - GET never writes, signed or not. Link scanners, antivirus proxies and
 *    mail-client prefetchers all follow GETs, and a GET that unsubscribed let
 *    anyone who knew an address silence it (including its team emails). It
 *    sends the reader to a confirm page with one button.
 *  - POST with a valid signature (the confirm button, or a mail provider's
 *    RFC 8058 one-click) unsubscribes fully: marketing AND the team
 *    announcement / results / player emails (unsubscribed_at).
 *  - POST without one (emails sent before links were signed, or a signature
 *    that no longer verifies after a JWT_SECRET rotation) is still honoured,
 *    because those emails sit in inboxes forever — but ONLY as a marketing
 *    opt-out (marketing_unsubscribed_at), only from our own confirm page
 *    (same-origin) or as a server-side one-click, and under per-IP and
 *    per-address rate limits. A provider's one-click carries no Origin, so it
 *    is indistinguishable from a script; if it could set the full opt-out,
 *    anyone who knew a family's address could cut them off from their own
 *    team's emails (QA D4). Marketing is the worst an unsigned request can
 *    stop, and every marketing email already carries a signed link.
 */

const LEGACY_IP_LIMIT = { limit: 10, windowSeconds: 60 * 60 }
const LEGACY_EMAIL_LIMIT = { limit: 5, windowSeconds: 24 * 60 * 60 }
const MAX_BODY = 4096

/** Full opt-out. Only ever called for a request carrying a valid signature. */
async function unsubscribe(email: string): Promise<void> {
  // Upsert, not update: a player or parent who was never on the marketing
  // list (most team rosters) has no row, and an UPDATE alone left their
  // unsubscribe a silent no-op. An existing opt-out keeps its original date.
  await db`
    INSERT INTO email_list (email, unsubscribed_at)
    VALUES (${email}, NOW())
    ON CONFLICT (email) DO UPDATE
      SET unsubscribed_at = COALESCE(email_list.unsubscribed_at, EXCLUDED.unsubscribed_at)
  `
}

/**
 * Marketing-only opt-out, for unsigned (legacy) requests. Team, results and
 * player emails keep checking unsubscribed_at alone, so they still arrive.
 */
async function unsubscribeMarketing(email: string): Promise<void> {
  await db`
    INSERT INTO email_list (email, marketing_unsubscribed_at)
    VALUES (${email}, NOW())
    ON CONFLICT (email) DO UPDATE
      SET marketing_unsubscribed_at = COALESCE(email_list.marketing_unsubscribed_at, EXCLUDED.marketing_unsubscribed_at)
  `
}

function confirmPath(email: string, sig: string | null, error?: string): string {
  const params = new URLSearchParams({ email })
  if (sig) params.set('sig', sig)
  if (error) params.set('error', error)
  return `/unsubscribe/confirm?${params.toString()}`
}

// Someone clicking the link in the email body (or a scanner following it).
export async function GET(req: NextRequest) {
  const email = normalizeUnsubscribeEmail(req.nextUrl.searchParams.get('email'))
  if (!email) return NextResponse.redirect(new URL('/', req.url), 303)
  const sig = req.nextUrl.searchParams.get('sig')
  const res = NextResponse.redirect(new URL(confirmPath(email, sig), req.url), 303)
  res.headers.set('Cache-Control', 'no-store')
  return res
}

interface ParsedBody {
  fields: URLSearchParams
  /** The body is exactly RFC 8058's `List-Unsubscribe=One-Click` and nothing else. */
  oneClick: boolean
}

async function readBody(req: NextRequest): Promise<ParsedBody> {
  const type = req.headers.get('content-type') || ''
  const fields = new URLSearchParams()
  try {
    if (type.includes('multipart/form-data')) {
      // RFC 8058 allows multipart as well as urlencoded.
      const form = await req.formData()
      for (const [k, v] of form.entries()) if (typeof v === 'string') fields.append(k, v)
    } else {
      const text = await req.text()
      if (text.length <= MAX_BODY) new URLSearchParams(text.trim()).forEach((v, k) => fields.append(k, v))
    }
  } catch {
    // An unreadable body is just an empty one.
  }
  const keys = [...fields.keys()]
  const oneClick = keys.length === 1 && keys[0] === 'List-Unsubscribe' && fields.get('List-Unsubscribe') === 'One-Click'
  return { fields, oneClick }
}

/** Origin header present and naming this site (the confirm page's own form). */
function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (!origin || origin === 'null') return false
  try {
    const host = new URL(origin).host
    return host === req.headers.get('host') || host === req.nextUrl.host
  } catch {
    return false
  }
}

function text(body: string, status: number, extra: Record<string, string> = {}): NextResponse {
  return new NextResponse(body, { status, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', ...extra } })
}

/**
 * The confirm button and one-click unsubscribe (RFC 8058).
 *
 * Every bulk email carries `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
 * a promise that this URL accepts POST. Gmail and Yahoo require a working
 * one-click endpoint from bulk senders, and a reader whose unsubscribe does
 * nothing reports the message as spam instead. One-click gets a direct 200
 * with no redirect, as RFC 8058 asks; the confirm page's button (a browser
 * form) is sent on to /unsubscribed.
 */
export async function POST(req: NextRequest) {
  const { fields, oneClick } = await readBody(req)
  const fromPage = fields.get('confirm') === '1'
  const email = normalizeUnsubscribeEmail(req.nextUrl.searchParams.get('email') || fields.get('email'))
  const sig = req.nextUrl.searchParams.get('sig') || fields.get('sig')

  if (!email) {
    return fromPage ? NextResponse.redirect(new URL('/', req.url), 303) : text('Invalid unsubscribe request', 400)
  }

  const done = (scope: 'all' | 'marketing') =>
    fromPage
      ? NextResponse.redirect(new URL(scope === 'marketing' ? '/unsubscribed?scope=marketing' : '/unsubscribed', req.url), 303)
      : text(scope === 'marketing' ? 'Unsubscribed from marketing emails' : 'Unsubscribed', 200)
  const refuse = (error: 'origin' | 'limit' | 'failed', status: number, extra: Record<string, string> = {}) =>
    fromPage
      ? NextResponse.redirect(new URL(confirmPath(email, sig, error), req.url), 303)
      : text(error === 'limit' ? 'Too many requests' : error === 'failed' ? 'Try again later' : 'Forbidden', status, extra)

  try {
    if (verifyUnsubscribeSig(email, sig)) {
      await unsubscribe(email)
      return done('all')
    }

    // Legacy (unsigned, or a signature that doesn't verify). Two shapes are
    // accepted: our own confirm page, which the browser marks same-origin, and
    // a mail provider's one-click, which is server-to-server and so carries no
    // Origin at all. A browser on another site can forge the one-click body
    // (a text/plain form), but it cannot omit or fake its Origin.
    const origin = req.headers.get('origin')
    const allowed = isSameOrigin(req) || (oneClick && !origin)
    if (!allowed) return refuse('origin', 403)

    const ip = await rateLimit(`unsub-legacy:ip:${clientIp(req)}`, LEGACY_IP_LIMIT.limit, LEGACY_IP_LIMIT.windowSeconds)
    if (!ip.ok) return refuse('limit', 429, { 'Retry-After': String(ip.retryAfterSeconds) })
    const addr = await rateLimit(`unsub-legacy:email:${email}`, LEGACY_EMAIL_LIMIT.limit, LEGACY_EMAIL_LIMIT.windowSeconds)
    if (!addr.ok) return refuse('limit', 429, { 'Retry-After': String(addr.retryAfterSeconds) })

    // Unsigned: marketing only (see the header comment).
    await unsubscribeMarketing(email)
    return done('marketing')
  } catch (err) {
    console.error('Unsubscribe failed:', err)
    return refuse('failed', 500)
  }
}
