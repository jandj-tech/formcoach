import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  const { frames } = await req.json() as { frames: string[] }
  const n = frames.length

  const imageBlocks: Anthropic.ImageBlockParam[] = frames.map((data) => ({
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data },
  }))

  const response = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }).messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: [
        ...imageBlocks,
        {
          type: 'text',
          text: `These are ${n} evenly-spaced frames numbered 0 to ${n - 1} from a basketball video.

Find the FIRST basketball shot and return its window:
- "start": the frame where the player begins loading up to shoot (knees bending, ball moving to shot pocket) — AFTER any catch/reception is fully settled
- "end": the frame where the follow-through is complete or the ball is clearly in the air away from the hand

Rules:
- If the player catches a pass before shooting, "start" must be AFTER the catch is settled and the player is loading up
- Do NOT include frames of catching, dribbling, walking, or standing still
- Find the FIRST shot only
- If you cannot find a clear shot, pick the most likely window

Output ONLY this JSON, nothing else: {"start": <frame 0 to ${n - 1}>, "end": <frame 0 to ${n - 1}>}`,
        },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const match = text.match(/\{[\s\S]*?\}/)

  // Fallback: use middle third of video
  const fallbackStart = Math.floor(n * 0.1)
  const fallbackEnd = Math.floor(n * 0.9)
  if (!match) return NextResponse.json({ start: fallbackStart, end: fallbackEnd })

  const parsed = JSON.parse(match[0])
  const start = Math.max(0, Math.min(n - 1, Number(parsed.start ?? 0)))
  const end = Math.max(start, Math.min(n - 1, Number(parsed.end ?? n - 1)))

  return NextResponse.json({ start, end })
}
