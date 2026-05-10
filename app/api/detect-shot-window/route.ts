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
          text: `These are ${n} evenly-spaced frames numbered 0 to ${n - 1} from a basketball video. There may be multiple shots in the video.

Find the frame showing the PEAK of the FIRST shot — the single moment where:
- The shooter's arm is at its HIGHEST point, fully extended straight up overhead
- The ball is at the very top of its release — either still on the fingertips or just leaving the hand
- The wrist is snapping or has just snapped downward

This is the most visually distinctive moment: arms straight up, body fully extended or at the top of the jump. There is exactly one peak per shot.

If there are multiple shots, use the FIRST shot only (earliest frames).

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
