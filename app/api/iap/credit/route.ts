import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'

// The app calls this right after a StoreKit purchase succeeds. Tokens are
// granted only by the RevenueCat webhook — this route never credits anything
// itself; it just waits for the webhook's grant to land so the app can show
// "credited" instead of "pending". Claiming (acknowledged_at) is atomic so a
// grant can only confirm one purchase flow, and only for its own user.
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const deadline = Date.now() + 8000
  for (;;) {
    const [event] = await db`
      UPDATE iap_events SET acknowledged_at = NOW()
      WHERE event_id = (
        SELECT event_id FROM iap_events
        WHERE user_id = ${session.userId}
          AND acknowledged_at IS NULL
          AND tokens_granted > 0
          AND created_at > NOW() - INTERVAL '15 minutes'
        ORDER BY created_at
        LIMIT 1
      ) AND acknowledged_at IS NULL
      RETURNING event_id
    `
    if (event) return NextResponse.json({ success: true })
    if (Date.now() >= deadline) break
    await new Promise((resolve) => setTimeout(resolve, 750))
  }

  // Webhook hasn't landed yet — it still will; the app shows its
  // "token will be added automatically" pending state.
  return NextResponse.json({ error: 'Purchase not confirmed yet' }, { status: 404 })
}
