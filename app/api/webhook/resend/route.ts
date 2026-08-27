import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { requireEnv, safeEqual } from '@/lib/env'
import { suppressBounced, suppressComplained } from '@/lib/email-list'

/**
 * Resend delivery events -> suppression list.
 *
 * Without this endpoint nothing in the app ever learned that an address was
 * dead or that someone had reported us. The monthly promo cron re-sent to every
 * address on file, so a mailbox that hard-bounced in March was still being
 * mailed in August. Mailbox providers read exactly that pattern -- a sender who
 * keeps hammering addresses that do not exist, and keeps mailing people who
 * pressed "report spam" -- as the signature of a list that was not built from
 * consent, and they move the whole domain to the spam folder accordingly.
 *
 * Register at: Resend dashboard -> Webhooks -> https://www.learnhoops.com/api/webhook/resend
 * Subscribe to: email.bounced, email.complained
 */

// Resend signs with the Svix scheme. Verified here rather than by adding the
// `svix` package: it is ~30 lines of HMAC, and this repo already hand-rolls its
// constant-time compare.
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

function verifySignature(rawBody: string, headers: Headers): boolean {
  const id = headers.get('svix-id')
  const timestamp = headers.get('svix-timestamp')
  const signatureHeader = headers.get('svix-signature')
  if (!id || !timestamp || !signatureHeader) return false

  // Reject replays of a captured request.
  const sentAt = Number(timestamp)
  if (!Number.isFinite(sentAt)) return false
  if (Math.abs(Date.now() / 1000 - sentAt) > SIGNATURE_TOLERANCE_SECONDS) return false

  // requireEnv, not `process.env.X || skip`: a missing secret must fail the
  // request, never silently disable authentication on a public endpoint.
  const secret = requireEnv('RESEND_WEBHOOK_SECRET')
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64')

  // The header carries a space-delimited list of `v<version>,<signature>` --
  // more than one during a secret rotation. Any match is a pass.
  return signatureHeader
    .split(' ')
    .filter((part) => part.startsWith('v1,'))
    .some((part) => safeEqual(part.slice(3), expected))
}

interface ResendEvent {
  type?: string
  data?: {
    to?: string[] | string
    email?: string
    bounce?: { type?: string; subType?: string }
  }
}

/** `to` arrives as an array on most events and a bare string on some. */
function recipients(data: ResendEvent['data']): string[] {
  if (!data) return []
  const to = data.to
  if (Array.isArray(to)) return to.filter((e): e is string => typeof e === 'string')
  if (typeof to === 'string') return [to]
  if (typeof data.email === 'string') return [data.email]
  return []
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  if (!verifySignature(rawBody, req.headers)) {
    console.error('[resend webhook] rejected: signature verification failed')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let event: ResendEvent
  try {
    event = JSON.parse(rawBody) as ResendEvent
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const addresses = recipients(event.data)
  console.log('[resend webhook] received', event.type, 'recipients=', addresses.length)

  try {
    if (event.type === 'email.bounced') {
      // Only permanent bounces suppress. A transient one -- full mailbox,
      // greylisting, a server having a bad afternoon -- resolves on its own,
      // and suppressing on it would quietly delete real recipients.
      const bounceType = event.data?.bounce?.type
      if (bounceType === 'Permanent') {
        for (const email of addresses) await suppressBounced(email)
        console.log('[resend webhook] suppressed hard bounce:', addresses.join(', '))
      } else {
        console.log('[resend webhook] soft bounce, not suppressing:', bounceType)
      }
    } else if (event.type === 'email.complained') {
      for (const email of addresses) await suppressComplained(email)
      console.log('[resend webhook] suppressed complaint:', addresses.join(', '))
    }
  } catch (err) {
    // Log and 200: Resend retries on non-2xx, and a DB blip should not become a
    // retry storm. The next event for the same address will suppress it.
    console.error('[resend webhook] handler error:', err)
  }

  return NextResponse.json({ received: true })
}
