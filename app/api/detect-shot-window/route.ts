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

Find the frame showing the RELEASE PEAK of the FIRST basketball shot — the exact moment where:
- The shooter's arm is fully extended UPWARD with the ball at the fingertips or just released
- The wrist is snapping or has just snapped downward toward the basket
- The body is at full extension — this is the highest point of the shooting motion

IMPORTANT — do NOT pick:
- Frames where the player is just catching or receiving the ball
- Frames where the player is walking, dribbling, or holding the ball at their side or chest
- Frames showing only follow-through after the ball is already in the air far from the hand
- Any moment that is not specifically the shooting release

The peak is the single most visually distinct frame of the shot: arm fully up, ball at or just leaving the fingertips. If the player catches and then shoots, ignore the catch — find the shooting release only.

Do not explain your reasoning. Output ONLY the JSON object, nothing else: {"peak": <frame number 0 to ${n - 1}>}`,
        },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const match = text.match(/\{[\s\S]*?\}/)
  if (!match) return NextResponse.json({ peak: Math.floor(n / 4) })

  const parsed = JSON.parse(match[0])
  return NextResponse.json({
    peak: Math.max(0, Math.min(n - 1, Number(parsed.peak ?? parsed.start ?? 0))),
  })
}
