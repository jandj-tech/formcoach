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

Find the RELEASE frame — the single moment where the shooter is at the peak of their jump with their shooting arm fully extended upward and the ball at their fingertips just leaving (or just having left) their hand. This is the most visually distinctive moment of any jump shot: full extension, ball at the top, wrist snapping or just snapped.

If there are multiple shots in the video, return the LAST release frame (highest frame number).

Do NOT return a setup frame, a dribbling frame, or a follow-through frame. Only the release — arm up, ball at fingertips.

Output ONLY this JSON, nothing else: {"release": <frame number 0 to ${n - 1}>}`,
        },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const match = text.match(/\{[\s\S]*?\}/)

  const fallback = Math.floor(n * 0.6)
  if (!match) return NextResponse.json({ release: fallback })

  const parsed = JSON.parse(match[0])
  const release = Math.max(0, Math.min(n - 1, Number(parsed.release ?? fallback)))

  return NextResponse.json({ release })
}
