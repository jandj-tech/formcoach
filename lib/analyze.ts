import Anthropic from '@anthropic-ai/sdk'
import { db } from './db'

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

interface CriterionResult {
  id: number
  score: number | null
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
    LIMIT 40
  `

  const criteriaText = activeCriteria
    .map(
      (c) =>
        `- ID ${c.id}: "${c.name}" — ${c.description} (weight: ${c.weight})`
    )
    .join('\n')

  const feedbackText =
    recentFeedback.length > 0
      ? '\n\nCRITICAL — The following are human expert corrections to past AI scores. ' +
        'You MUST apply these lessons to your scoring. If you see the same issues, score accordingly:\n' +
        recentFeedback
          .map(
            (f) =>
              `- "${f.name}": AI scored ${f.ai_score}/10 but expert corrected to ${f.admin_score}/10` +
              (f.admin_notes ? ` — Expert note: "${f.admin_notes}"` : '') +
              (Number(f.admin_score) > Number(f.ai_score)
                ? ' (AI was too harsh — be more generous on this criterion)'
                : Number(f.admin_score) < Number(f.ai_score)
                ? ' (AI was too lenient — be stricter on this criterion)'
                : ' (score was correct but reasoning needed improvement)')
          )
          .join('\n')
      : ''

  const n = frameBase64Array.length
  const earlyEnd = Math.round(n * 0.4)
  const midEnd = Math.round(n * 0.7)

  const systemPrompt = `You are an expert basketball shooting coach analyzing a player's shooting form.
You will receive ${n} sequential frames from a basketball shot. Use this frame map to know where to look for each criterion:

- Frames 1–${earlyEnd} (SETUP): stance, foot position, knees bent, squareness to basket, shot pocket, elbow L-shape, grip/thumb/palm/guide hand placement
- Frames ${earlyEnd + 1}–${midEnd} (RELEASE): source of power, one-hand release, two-finger release, guide hand separation, elbow alignment at release
- Frames ${midEnd + 1}–${n} (FOLLOW-THROUGH): shooting hand follow-through (goose neck), guide hand follow-through, ball rotation/backspin, shot arc, forward motion and toes

WHEN TO SCORE vs NULL: Each criterion lists multiple indicators. You do NOT need to see all of them — if you can clearly see enough to form a confident judgment, assign a score. Only set "score" to null if the criterion is genuinely unassessable (body part out of frame, angle completely hides it, too blurry to tell).

Score each visible criterion from 1 to 10:
- 1-3: Poor form, needs significant improvement
- 4-6: Average form, room for improvement
- 7-8: Good form, minor adjustments needed
- 9-10: Excellent form

For the overall_score, only average the criteria you were able to score (exclude nulls).

Scoring criteria:
${criteriaText}
${feedbackText}

Return ONLY valid JSON in this exact format, no other text:
{
  "overall_score": <average of scored criteria only, 1-10, one decimal>,
  "criteria": [
    { "id": <criterion_id>, "score": <1-10 or null if not clearly visible>, "reasoning": "<1-2 sentences — if null, explain what prevented assessment>" },
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
    max_tokens: 6000,
    thinking: { type: 'enabled', budget_tokens: 2000 },
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

  const textBlock = response.content.find((b) => b.type === 'text')
  const text = textBlock?.type === 'text' ? textBlock.text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in Claude response')

  return JSON.parse(jsonMatch[0]) as AnalysisResult
}
