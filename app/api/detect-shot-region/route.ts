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
