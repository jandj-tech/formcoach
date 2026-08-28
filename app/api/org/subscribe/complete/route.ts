import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { signOrgSession, orgSessionCookieOptions } from '@/lib/org-auth'
import { clearPendingCookieOptions } from '@/lib/pending-org'
import { createOrgFromCheckout } from '@/lib/create-org-from-checkout'

/**
 * Where Stripe sends the buyer after a successful subscription checkout.
 *
 * A Route Handler, not a page, and that is not a style choice: Next cannot set
 * cookies during Server Component render, and this has to write the org
 * session so the buyer lands logged in.
 *
 * It also doubles as the safety net for a slow or missed webhook — it calls
 * the same idempotent `createOrgFromCheckout`, so whichever arrives first wins
 * and the other is a no-op. Same belt-and-braces shape as the ball-shop
 * success page.
 *
 * Authentication note: the organization was created seconds ago and nobody is
 * logged in, so the Stripe session id is the only credential available. It is
 * high-entropy and known only to the buyer, but unlike the other places this
 * repo trusts a session id, this one hands over an account — hence the
 * freshness bound below.
 */

/** A success URL that leaks later must not still mint a session. */
const MAX_SESSION_AGE_SECONDS = 60 * 60

export async function GET(req: NextRequest) {
  const baseUrl = req.nextUrl.origin
  const sessionId = req.nextUrl.searchParams.get('session_id')

  if (!sessionId) {
    return NextResponse.redirect(`${baseUrl}/org/pricing`)
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId)

    const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required'
    const fresh = typeof session.created === 'number'
      && Date.now() / 1000 - session.created < MAX_SESSION_AGE_SECONDS

    if (
      session.mode !== 'subscription' ||
      session.metadata?.type !== 'org_subscription' ||
      !paid ||
      !fresh
    ) {
      console.warn('[org/subscribe/complete] rejected session', {
        sessionId,
        mode: session.mode,
        paymentStatus: session.payment_status,
        fresh,
      })
      return NextResponse.redirect(`${baseUrl}/org/login`)
    }

    const org = await createOrgFromCheckout(session)

    if (org) {
      const token = await signOrgSession({ orgId: org.orgId, adminEmail: org.adminEmail })
      const res = NextResponse.redirect(`${baseUrl}/org/dashboard?welcome=1`)
      res.cookies.set(orgSessionCookieOptions(token))
      res.cookies.set(clearPendingCookieOptions())
      return res
    }

    // Nothing to log into yet. Rather than bounce a paying customer to a login
    // form for an account that is moments from existing, hold and retry.
    return holdingScreen(sessionId, baseUrl)
  } catch (err) {
    console.error('[org/subscribe/complete] failed:', err)
    return holdingScreen(sessionId, baseUrl)
  }
}

function holdingScreen(sessionId: string, baseUrl: string): NextResponse {
  const safeId = sessionId.replace(/[<>&"]/g, '')
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="3" />
    <title>Setting up your organization…</title>
    <style>
      :root { color-scheme: light; }
      html, body { height: 100%; margin: 0; }
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        background: #fff; color: #111;
        display: flex; align-items: center; justify-content: center; padding: 24px;
      }
      .card { max-width: 420px; text-align: center; }
      .emoji { font-size: 56px; line-height: 1; }
      h1 { font-size: 22px; font-weight: 900; margin: 16px 0 8px; }
      p { color: #6b7280; margin: 8px 0; font-size: 14px; line-height: 1.5; }
      code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
      a { color: #f97316; font-weight: 700; text-decoration: none; font-size: 14px; }
      a:hover { color: #ea580c; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="emoji">🏀</div>
      <h1>Setting up your organization…</h1>
      <p>Your payment went through. We&rsquo;re creating your account now — this usually takes a few seconds, and this page will refresh on its own.</p>
      <p><code>${safeId}</code></p>
      <p><a href="${baseUrl}/org/login">Go to login →</a></p>
    </div>
  </body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
