import { NextRequest } from 'next/server'
import { clientIp } from '@/lib/rate-limit'

/**
 * Cloudflare Turnstile verification.
 *
 * Turnstile over reCAPTCHA/hCaptcha because this stack already lives on
 * Cloudflare (R2 for video storage), it is free at any volume, and it needs no
 * cookie-consent banner — most visitors are minors on a school network, and a
 * challenge that usually resolves with no interaction is the least intrusive
 * option that still stops a scripted client.
 *
 * The widget hands the browser a single-use token; this verifies it with
 * Cloudflare server-side. Verifying client-side would be theatre — the routes
 * are what a bot actually POSTs to.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export interface TurnstileResult {
  ok: boolean
  /** Safe to show a visitor; never leaks why the check failed. */
  error?: string
}

const PASS: TurnstileResult = { ok: true }
const FAIL: TurnstileResult = {
  ok: false,
  error: 'Human check failed. Please reload the page and try again.',
}

/** True once Turnstile is configured, so callers can require the widget. */
export function turnstileConfigured(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY
}

/**
 * Verifies a token from the Turnstile widget.
 *
 * Unconfigured (no secret key) passes: the code ships before the keys are set
 * in cPanel, and signup going down between those two moments would be a worse
 * outage than the spam it prevents. A missing or malformed token when the
 * secret IS set fails closed — that is the actual attack.
 *
 * A network failure reaching Cloudflare passes, matching lib/rate-limit's
 * fail-open stance: a broken dependency must not take signup offline. The
 * honeypot and rate limit still apply in that window.
 */
export async function verifyTurnstile(
  req: NextRequest,
  token: unknown
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return PASS

  if (typeof token !== 'string' || !token) return FAIL

  try {
    const body = new URLSearchParams({ secret, response: token })
    const ip = clientIp(req)
    if (ip && ip !== 'unknown') body.set('remoteip', ip)

    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(8000),
    })
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] }

    if (data.success) return PASS
    console.warn('[turnstile] rejected:', data['error-codes'])
    return FAIL
  } catch (err) {
    console.error('[turnstile] verification unreachable, allowing request:', err)
    return PASS
  }
}
