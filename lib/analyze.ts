import Anthropic from '@anthropic-ai/sdk'
import { db } from './db'

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

interface CriterionResult {
  id: number
  score: number
  reasoning: string
}

interface AnalysisResult {
  overall_score: number
  criteria: CriterionResult[]
}

export async function analyzeShot(
  frameBase64Array: string[],
  frameMimeTypes: string[]
): Promise<AnalysisResult> {
  const activeCriteria = await db`
    SELECT id, name, description, weight
    FROM criteria
    WHERE active = true
    ORDER BY order_index
  `

  const recentFeedback = await db`
    SELECT c.name, cs.ai_score, cs.admin_score, cs.admin_notes
    FROM criterion_scores cs
    JOIN criteria c ON cs.criterion_id = c.id
    WHERE cs.admin_score IS NOT NULL
    ORDER BY cs.id DESC
    LIMIT 20
  `

  const criteriaText = activeCriteria
    .map(
      (c) =>
        `- ID ${c.id}: "${c.name}" — ${c.description} (weight: ${c.weight})`
    )
    .join('\n')

  const feedbackText =
    recentFeedback.length > 0
      ? '\n\nLearn from these admin-corrected examples:\n' +
        recentFeedback
          .map(
            (f) =>
              `- "${f.name}": AI gave ${f.ai_score}/10, correct score was ${f.admin_score}/10${f.admin_notes ? ` (note: ${f.admin_notes})` : ''}`
          )
          .join('\n')
      : ''

  const systemPrompt = `You are an expert basketball shooting coach analyzing a player's shooting form.
You will receive ${frameBase64Array.length} sequential frames extracted from a basketball shooting video.
Analyze the complete shooting motion across all frames.

Score each criterion from 1 to 10:
- 1-3: Poor form, needs significant improvement
- 4-6: Average form, room for improvement
- 7-8: Good form, minor adjustments needed
- 9-10: Excellent form

Scoring criteria:
${criteriaText}
${feedbackText}

Return ONLY valid JSON in this exact format, no other text:
{
  "overall_score": <weighted average 1-10, one decimal>,
  "criteria": [
    { "id": <criterion_id>, "score": <1-10>, "reasoning": "<1-2 sentences explaining the score>" },
    ...
  ]
}`

  const imageContent: Anthropic.ImageBlockParam[] = frameBase64Array.map(
    (base64, i) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: (frameMimeTypes[i] || 'image/jpeg') as
          | 'image/jpeg'
          | 'image/png'
          | 'image/gif'
          | 'image/webp',
        data: base64,
      },
    })
  )

  const response = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: 'Analyze this basketball shot across all frames and return your scoring as JSON.',
          },
        ],
      },
    ],
  })

  const text =
    response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in Claude response')

  return JSON.parse(jsonMatch[0]) as AnalysisResult
}
