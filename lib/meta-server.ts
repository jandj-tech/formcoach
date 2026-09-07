// Server-side Meta Conversions API. Sends events that the browser pixel misses
// due to iOS ATT, ad blockers, or Safari ITP. Every event that can also fire
// from the browser must share its event_id with the browser call, or Meta
// counts it twice — see trackCompleteRegistration in lib/meta-pixel.ts.
//
// Purchases are server-only (built from the Stripe webhook), keyed on the
// checkout session id so webhook redeliveries and the completed →
// async_payment_succeeded pair collapse into one conversion.
//
// Setup lives in Meta Events Manager: META_PIXEL_ID + META_CONVERSIONS_API_TOKEN
// (Settings → Conversions API → Generate access token). Unset vars make every
// send a silent no-op, so the code is safe to ship before the pixel exists.
// META_TEST_EVENT_CODE routes events to the Test Events tab while verifying.

import crypto from 'crypto'
import type { NextRequest } from 'next/server'
import type Stripe from 'stripe'

const API_VERSION = 'v23.0'

type MetaUserData = {
  em?: string[]
  ph?: string[]
  fn?: string[]
  ln?: string[]
  ct?: string[]
  st?: string[]
  zp?: string[]
  country?: string[]
  external_id?: string[]
  client_ip_address?: string
  client_user_agent?: string
  fbc?: string
  fbp?: string
}

type MetaEvent = {
  event_name: string
  event_time: number
  event_id: string
  event_source_url?: string
  action_source: 'website' | 'app' | 'email' | 'other'
  user_data: MetaUserData
  custom_data?: Record<string, unknown>
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

// Normalization per Meta's hashing spec — a hash of un-normalized input
// matches nothing on their side, which silently zeroes Event Match Quality.
function hashEmail(email: string): string {
  return sha256(email.toLowerCase().trim())
}
/** Digits only, no leading zeros — Stripe gives E.164 so this keeps the country code. */
function hashPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '').replace(/^0+/, '')
  return digits ? sha256(digits) : null
}
/** Lowercased letters only (city and name fields). */
function hashAlpha(value: string): string | null {
  const cleaned = value.toLowerCase().replace(/[^a-z]/g, '')
  return cleaned ? sha256(cleaned) : null
}
/** Lowercase, no spaces; US zips truncate to 5 per spec. */
function hashZip(zip: string, country?: string | null): string | null {
  let cleaned = zip.toLowerCase().replace(/\s/g, '')
  if ((country ?? '').toUpperCase() === 'US') cleaned = cleaned.slice(0, 5)
  return cleaned ? sha256(cleaned) : null
}
/** Two-letter lowercase codes (state, country). */
function hashCode(code: string): string | null {
  const cleaned = code.toLowerCase().replace(/[^a-z]/g, '').slice(0, 2)
  return cleaned ? sha256(cleaned) : null
}

export function buildEventId(): string {
  return crypto.randomUUID()
}

let loggedUnconfigured = false

export async function sendMetaEvent(event: MetaEvent | MetaEvent[]): Promise<void> {
  const pixelId = process.env.META_PIXEL_ID
  const accessToken = process.env.META_CONVERSIONS_API_TOKEN
  const events = Array.isArray(event) ? event : [event]
  if (events.length === 0) return

  if (!pixelId || !accessToken) {
    // Say so once per process — a misconfigured production env otherwise looks
    // identical to working tracking until the ad account shows zero conversions.
    if (!loggedUnconfigured) {
      loggedUnconfigured = true
      console.log('[meta capi] skipped: META_PIXEL_ID / META_CONVERSIONS_API_TOKEN not set')
    }
    return
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${pixelId}/events`
  const body: Record<string, unknown> = { data: events, access_token: accessToken }
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      // Meta's error body names the exact problem (bad token, malformed field).
      const detail = await res.text().catch(() => '')
      console.error('[meta capi] send failed', res.status, detail.slice(0, 500))
    }
  } catch (err) {
    // Non-fatal — ad reporting must never break checkout, signup, or webhooks.
    console.error('[meta capi] send error:', err instanceof Error ? err.message : err)
  }
}

type RequestAttribution = {
  ip?: string
  userAgent?: string
  fbp?: string
  fbc?: string
  sourceUrl?: string
}

/**
 * Click attribution readable from a same-origin request: the _fbp/_fbc cookies
 * (set by the pixel, so present only for visitors who accepted marketing
 * cookies), the caller's IP and user agent, and the page the request came from.
 */
export function attributionFromRequest(req: NextRequest): RequestAttribution {
  const userAgent = req.headers.get('user-agent') ?? undefined
  // The app never asks for ATT authorization, so requests from its WebView
  // carry no tracking signals — same stance as the signup CAPI skip.
  if (userAgent?.includes('LearnHoopsApp')) return {}
  return {
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    userAgent,
    fbp: req.cookies.get('_fbp')?.value,
    fbc: req.cookies.get('_fbc')?.value,
    sourceUrl: req.headers.get('referer') ?? undefined,
  }
}

/**
 * The same attribution shaped for Stripe checkout-session metadata, so the
 * webhook — which has no cookies — can hand the ad click back to Meta with the
 * Purchase. Values capped to Stripe's 500-char metadata limit. Spread into the
 * metadata object at every checkout.sessions.create that a person reaches from
 * the website.
 */
export function stripeAttributionMetadata(req: NextRequest): Record<string, string> {
  const attr = attributionFromRequest(req)
  const out: Record<string, string> = {}
  if (attr.fbp) out.fb_fbp = attr.fbp.slice(0, 500)
  if (attr.fbc) out.fb_fbc = attr.fbc.slice(0, 500)
  if (attr.ip) out.fb_ip = attr.ip.slice(0, 45)
  if (attr.userAgent) out.fb_ua = attr.userAgent.slice(0, 500)
  if (attr.sourceUrl) out.fb_src = attr.sourceUrl.slice(0, 200)
  return out
}

function userDataFromAttribution(attr: RequestAttribution): MetaUserData {
  return {
    client_ip_address: attr.ip,
    client_user_agent: attr.userAgent,
    fbc: attr.fbc,
    fbp: attr.fbp,
  }
}

export function makeRegistrationEvent(opts: {
  email: string
  eventId?: string
  ip?: string
  userAgent?: string
  url?: string
  fbc?: string
  fbp?: string
}): MetaEvent {
  return {
    event_name: 'CompleteRegistration',
    event_time: Math.floor(Date.now() / 1000),
    event_id: opts.eventId ?? buildEventId(),
    event_source_url: opts.url,
    action_source: 'website',
    user_data: {
      em: [hashEmail(opts.email)],
      ...userDataFromAttribution(opts),
    },
  }
}

export function makeLeadEvent(opts: {
  email?: string
  eventId?: string
  ip?: string
  userAgent?: string
  url?: string
  fbc?: string
  fbp?: string
}): MetaEvent {
  return {
    event_name: 'Lead',
    event_time: Math.floor(Date.now() / 1000),
    event_id: opts.eventId ?? buildEventId(),
    event_source_url: opts.url,
    action_source: 'website',
    user_data: {
      ...(opts.email ? { em: [hashEmail(opts.email)] } : {}),
      ...userDataFromAttribution(opts),
    },
  }
}

/** Checkout kinds that are recurring plans — these send Subscribe alongside Purchase. */
const SUBSCRIPTION_KINDS = new Set(['player_subscription', 'org_subscription', 'org_reactivate'])

/**
 * The Conversions API events for one PAID Stripe checkout session. Called from
 * the Stripe webhook once payment has settled; returns [] for zero-total
 * (comp-coupon) sessions, which would otherwise teach the ad algorithm that
 * $0 buyers are the target customer.
 *
 * Match-quality inputs come from two places: the buyer identity Stripe
 * collected (email, phone, name, address) and the fb_* metadata stamped at
 * session creation by stripeAttributionMetadata.
 */
export function checkoutSessionEvents(session: Stripe.Checkout.Session): MetaEvent[] {
  const amountCents = session.amount_total ?? 0
  if (amountCents <= 0) return []

  const kind =
    session.metadata?.type ||
    (session.metadata?.plan === 'team-credits' ? 'team_credits' : 'ball_shop')

  const details = session.customer_details
  const address = details?.address
  // Stripe gives one full-name string; Meta wants first/last. Last word as the
  // last name handles middle names better than splitting on the first space.
  const nameParts = (details?.name ?? '').trim().split(/\s+/).filter(Boolean)
  const firstName = nameParts.length > 0 ? nameParts[0] : null
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : null

  const phoneHash = details?.phone ? hashPhone(details.phone) : null
  const fnHash = firstName ? hashAlpha(firstName) : null
  const lnHash = lastName ? hashAlpha(lastName) : null
  const ctHash = address?.city ? hashAlpha(address.city) : null
  const stHash = address?.state ? hashCode(address.state) : null
  const zpHash = address?.postal_code ? hashZip(address.postal_code, address.country) : null
  const countryHash = address?.country ? hashCode(address.country) : null

  const user_data: MetaUserData = {
    ...(details?.email ? { em: [hashEmail(details.email)] } : {}),
    ...(phoneHash ? { ph: [phoneHash] } : {}),
    ...(fnHash ? { fn: [fnHash] } : {}),
    ...(lnHash ? { ln: [lnHash] } : {}),
    ...(ctHash ? { ct: [ctHash] } : {}),
    ...(stHash ? { st: [stHash] } : {}),
    ...(zpHash ? { zp: [zpHash] } : {}),
    ...(countryHash ? { country: [countryHash] } : {}),
    client_ip_address: session.metadata?.fb_ip || undefined,
    client_user_agent: session.metadata?.fb_ua || undefined,
    fbp: session.metadata?.fb_fbp || undefined,
    fbc: session.metadata?.fb_fbc || undefined,
  }

  const event_time = Math.floor(Date.now() / 1000)
  const event_source_url = session.metadata?.fb_src || 'https://www.learnhoops.com'
  const custom_data = {
    value: amountCents / 100,
    currency: (session.currency ?? 'usd').toUpperCase(),
    content_name: kind,
    order_id: session.id,
  }

  const events: MetaEvent[] = [
    {
      event_name: 'Purchase',
      event_time,
      // The session id makes redeliveries of the same session — and a future
      // browser-side Purchase using the same id — one conversion, not two.
      event_id: session.id,
      event_source_url,
      action_source: 'website',
      user_data,
      custom_data,
    },
  ]

  if (SUBSCRIPTION_KINDS.has(kind)) {
    events.push({
      event_name: 'Subscribe',
      event_time,
      event_id: `sub_${session.id}`,
      event_source_url,
      action_source: 'website',
      user_data,
      custom_data,
    })
  }

  return events
}
