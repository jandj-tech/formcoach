import { NextRequest, NextResponse } from 'next/server'
import { detectShotRegion } from '@/lib/shot-detect'
import { resolveUploader, uploaderKey } from '@/lib/upload-guard'
import { rateLimit, rateLimitByIp } from '@/lib/rate-limit'
import { validateFrames } from '@/lib/frame-input'

// Spends our Anthropic key, so it is gated the same way /api/analyze is: a
// signed-in player, coach or org, or a valid team access code for anonymous
// team uploads. Was previously open to the internet with no frame cap.
const ROUTE = 'detect-shot-region'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    frames?: unknown
    teamCode?: string | null
  }

  const uploader = await resolveUploader(req, body.teamCode)
  if (!uploader) {
    return NextResponse.json({ error: 'Login required' }, { status: 401 })
  }

  const check = validateFrames(body.frames)
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 })
  }
  const frames = check.frames

  // Two windows: one per caller, one per IP so a single machine cannot cycle
  // team codes to multiply its budget.
  const perCaller = await rateLimit(`${ROUTE}:${uploaderKey(uploader)}`, 60, 600)
  if (!perCaller.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(perCaller.retryAfterSeconds) } }
    )
  }
  const perIp = await rateLimitByIp(req, ROUTE, 120, 600)
  if (!perIp.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(perIp.retryAfterSeconds) } }
    )
  }

  // Prompt and parsing live in lib/shot-detect.ts, shared with the server-side
  // extractor so both decode paths window the clip identically.
  const region = await detectShotRegion(frames)
  return NextResponse.json({ region })
}
