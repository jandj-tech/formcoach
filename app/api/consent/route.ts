import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimitByIp } from '@/lib/rate-limit'

/**
 * Records that a cookie-consent decision happened — accept or reject, on which
 * page, from which campaign. Nothing that identifies the visitor is stored (see
 * scripts/migrate-consent-events.sql), so this is a counter, not a tracker, and
 * it is the one measurement that works for people who decline the pixel.
 *
 * Best-effort by design: a failure here must never block or delay the choice
 * the visitor just made, so every error answers 204 like a success.
 */
export async function POST(req: NextRequest) {
  const limit = await rateLimitByIp(req, 'consent', 30, 3600)
  if (!limit.ok) return new NextResponse(null, { status: 204 })

  try {
    const body = (await req.json().catch(() => ({}))) as {
      choice?: unknown
      path?: unknown
      utmSource?: unknown
      utmCampaign?: unknown
    }
    const choice = body.choice === 'accept' ? 'accept' : body.choice === 'reject' ? 'reject' : null
    if (!choice) return new NextResponse(null, { status: 204 })

    const str = (v: unknown, max: number) =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

    await db`
      INSERT INTO consent_events (choice, path, utm_source, utm_campaign)
      VALUES (${choice}, ${str(body.path, 200)}, ${str(body.utmSource, 100)}, ${str(body.utmCampaign, 200)})
    `
  } catch (err) {
    console.error('[consent] record failed (non-fatal):', err)
  }

  return new NextResponse(null, { status: 204 })
}
