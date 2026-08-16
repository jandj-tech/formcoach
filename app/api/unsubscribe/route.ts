import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

async function unsubscribe(email: string | null): Promise<void> {
  const clean = email?.toLowerCase().trim()
  if (!clean) return
  await db`
    UPDATE email_list
    SET unsubscribed_at = NOW()
    WHERE email = ${clean}
    AND unsubscribed_at IS NULL
  `
}

// Someone clicking the unsubscribe link in the email body.
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')
  if (!email) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  await unsubscribe(email)

  return NextResponse.redirect(new URL('/unsubscribed', req.url))
}

/**
 * One-click unsubscribe (RFC 8058).
 *
 * Every email we send carries `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
 * which is a promise that this URL accepts POST. It did not — POST returned
 * 405 — so when someone used Gmail's or Yahoo's own Unsubscribe button the
 * request failed silently and they stayed subscribed. Both providers require
 * a working one-click endpoint from bulk senders, and a reader whose
 * unsubscribe does nothing reports the message as spam instead, which is the
 * single most expensive thing that can happen to a sending domain.
 *
 * Always answers 200, even for an unknown address: the mail provider is
 * reading the status code, not the outcome, and an error here reads as a
 * broken endpoint. No redirect — RFC 8058 wants the response served directly.
 */
export async function POST(req: NextRequest) {
  try {
    let email = req.nextUrl.searchParams.get('email')

    // Some providers post the address in the form body rather than relying on
    // the query string they were given.
    if (!email) {
      const body = await req.text().catch(() => '')
      email = new URLSearchParams(body).get('email')
    }

    await unsubscribe(email)
  } catch (err) {
    console.error('One-click unsubscribe failed:', err)
  }

  return new NextResponse('Unsubscribed', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}
