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
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: [
        ...imageBlocks,
        {
          type: 'text',
          text: `These are ${n} evenly-spaced frames numbered 0 to ${n - 1} from a basketball video.

Find:
- START: the earliest frame where the shooter is receiving the ball, catching it, or has it in their shot pocket ready to go up (knees bent, ball held at chest/hip level in shooting position)
- END: the frame where the ball has clearly left their hand and is no longer visible, or the shot result (make or miss) is visible, or the follow-through is fully complete

Return ONLY valid JSON with no other text: {"start": <number 0-${n - 1}>, "end": <number 0-${n - 1}>}`,
        },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const match = text.match(/\{[\s\S]*?\}/)
  if (!match) return NextResponse.json({ start: 0, end: n - 1 })

  const parsed = JSON.parse(match[0])
  return NextResponse.json({
    start: Math.max(0, Math.min(n - 1, Number(parsed.start))),
    end: Math.max(0, Math.min(n - 1, Number(parsed.end))),
  })
}
