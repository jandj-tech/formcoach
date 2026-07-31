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
  const ua = req.headers.get('user-agent') ?? ''
  if (ua.includes(IN_APP_UA_MARKER)) {
    return NextResponse.json(
      { error: 'Purchases in the iOS app are made with in-app purchase.' },
      { status: 403 },
    )
  }
  return null
}
