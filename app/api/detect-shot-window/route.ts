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
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: [
        ...imageBlocks,
        {
          type: 'text',
          text: `These are ${n} evenly-spaced frames numbered 0 to ${n - 1} from a basketball video.

First, look at frames 0-4. If the ball is ALREADY above the player's shoulders or clearly in the air in those early frames, the first shot started before the recording began — it is INCOMPLETE. In that case, skip it entirely and find the NEXT shot in the video.

Find the frame where a player BEGINS their shooting motion for a COMPLETE shot — the moment the player has the ball at chest/waist level and starts the knee bend or upward motion toward the basket. The player must have the ball in their hands at this frame, not releasing it.

Rules:
- If the first shot is incomplete (ball already in air in frames 0-4), return the setup frame of the NEXT complete shot
- SKIP return passes (ball traveling back toward the shooter sideways)
- The shot must be directed TOWARD the basket
- Return the frame where the player clearly has the ball and is beginning to shoot

Output ONLY this JSON, nothing else: {"setup": <frame 0 to ${n - 1}>}`,
        },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const match = text.match(/\{[\s\S]*?\}/)

  const fallbackSetup = Math.floor(n * 0.2)
  if (!match) return NextResponse.json({ setup: fallbackSetup })

  const parsed = JSON.parse(match[0])
  const setup = Math.max(0, Math.min(n - 1, Number(parsed.setup ?? fallbackSetup)))

  return NextResponse.json({ setup })
}
