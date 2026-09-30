import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// The LearnHoops iOS app's WebView appends this marker to its User-Agent
// (see learnhoops-mobile components/WebScreen.tsx). Digital-goods purchase
// UI must be hidden when it is present — App Store guideline 3.1.1 requires
// those purchases to go through native in-app purchase instead of Stripe.
// Physical goods (the training ball) may still check out via Stripe.
const IN_APP_UA_MARKER = 'LearnHoopsApp'

export async function isInAppRequest(): Promise<boolean> {
  const ua = (await headers()).get('user-agent') ?? ''
  return ua.includes(IN_APP_UA_MARKER)
}

// Server-side enforcement for digital-goods checkout routes: hiding buy
// buttons in the app is client-side only, so every route that creates a
// Stripe session for digital goods must also refuse in-app requests.
// Returns a 403 response to send back, or null to proceed.
export function rejectInAppPurchase(req: NextRequest): NextResponse | null {
  // Covers the native app too (isNativeAppRequest, below): the WebView marker
  // alone never caught it, so a native Bearer session could reach Stripe.
  if (isNativeAppRequest(req)) {
    return NextResponse.json(
      { error: 'Purchases in the iOS app are made with in-app purchase.' },
      { status: 403 },
    )
  }
  return null
}

// The native iOS app (not the old WebView) identifies as
// "LearnHoops/<build> CFNetwork/…" and authenticates with a Bearer token, so
// the WebView marker above never catches it. Org membership deals are
// WEBSITE ONLY (App Store guideline 3.1.1 and the owner's v1 decision), so
// their purchase routes refuse anything that looks like the app: the native
// UA, the WebView marker, or ANY Authorization header — a browser on the
// website authenticates with the httpOnly session cookie and never sends one.
const NATIVE_APP_UA = /\bLearnHoops\/\d+/

export function isNativeAppRequest(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') ?? ''
  return ua.includes(IN_APP_UA_MARKER) || NATIVE_APP_UA.test(ua) || req.headers.has('authorization')
}

/** 403 for any request from the iOS app (native or WebView) or carrying a Bearer token; null to proceed. */
export function rejectNativeAppPurchase(req: NextRequest): NextResponse | null {
  if (isNativeAppRequest(req)) {
    return NextResponse.json(
      { error: 'This purchase is not available in the app.' },
      { status: 403 },
    )
  }
  return null
}
