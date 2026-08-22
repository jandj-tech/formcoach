import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireEnv } from '@/lib/env'
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

  const n = frames.length

  const imageBlocks: Anthropic.ImageBlockParam[] = frames.map((data) => ({
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data },
  }))

  const response = await new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') }).messages.create({
    temperature: 0,
    model: 'claude-sonnet-4-6',
    max_tokens: 50,
    messages: [{
      role: 'user',
      content: [
        ...imageBlocks,
        {
          type: 'text',
          text: `These are ${n} evenly-spaced frames numbered 0 to ${n - 1} covering a basketball video from start to finish.

Which frame number is closest to the basketball shot release — the moment the shooter's arm is extended upward with the ball leaving their hand? If multiple shots, pick the last one. If no obvious release, pick the most likely frame.

Output ONLY this JSON: {"frame": <0 to ${n - 1}>}`,
        },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const match = text.match(/\{[\s\S]*?\}/)

  const fallbackFrame = Math.floor(n * 0.6)
  if (!match) return NextResponse.json({ region: 60 })

  const parsed = JSON.parse(match[0])
  const frame = Math.max(0, Math.min(n - 1, Number(parsed.frame ?? fallbackFrame)))
  const region = Math.round((frame / Math.max(1, n - 1)) * 100)

  return NextResponse.json({ region })
}
