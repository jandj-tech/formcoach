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
          text: `These are ${n} evenly-spaced frames numbered 0 to ${n - 1} from a basketball video. There may be multiple shots in the video.

Find the LAST frame (highest frame number) where you can see a player holding the basketball at shooting position — meaning:
- Ball is in the player's hands at hip, waist, or chest level (shot pocket), OR
- Player is catching or receiving a pass and about to shoot, OR
- Player's knees are bent with ball in hand, ready to jump

Do NOT pick frames showing only the follow-through (arm extended upward, ball already gone) or the ball in the air away from the player. We want the moment just BEFORE the shot goes up.

If you see a shooting setup in multiple places in the video, return the LAST one (highest frame number).

Return ONLY valid JSON: {"start": <frame number 0 to ${n - 1}>}`,
        },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const match = text.match(/\{[\s\S]*?\}/)
  if (!match) return NextResponse.json({ start: 0 })

  const parsed = JSON.parse(match[0])
  return NextResponse.json({
    start: Math.max(0, Math.min(n - 1, Number(parsed.start))),
  })
}
