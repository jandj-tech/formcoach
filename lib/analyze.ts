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

  // Aggregate corrections per criterion: avg drift, latest notes, correction count
  const calibration = await db`
    SELECT
      c.name,
      cs.criterion_id,
      ROUND(AVG(cs.admin_score - cs.ai_score)::numeric, 2) AS avg_drift,
      COUNT(*) AS corrections,
      MAX(cs.admin_notes) FILTER (WHERE cs.admin_notes IS NOT NULL AND cs.admin_notes != '') AS latest_note
    FROM criterion_scores cs
    JOIN criteria c ON cs.criterion_id = c.id
    WHERE cs.admin_score IS NOT NULL
    GROUP BY c.name, cs.criterion_id
    HAVING COUNT(*) >= 2
    ORDER BY ABS(AVG(cs.admin_score - cs.ai_score)) DESC
  `

  const criteriaText = activeCriteria
    .map((c) => `- ID ${c.id}: "${c.name}" — ${c.description}`)
    .join('\n')

  const feedbackText =
    calibration.length > 0
      ? '\n\nCALIBRATION — Expert corrections from past analyses. Adjust your scoring accordingly:\n' +
        calibration
          .map((f) => {
            const drift = Number(f.avg_drift)
            const direction =
              drift > 0
                ? `you score ${Math.abs(drift).toFixed(1)} pts too LOW on average — be more generous`
                : `you score ${Math.abs(drift).toFixed(1)} pts too HIGH on average — be stricter`
            return `- "${f.name}" (${f.corrections} corrections): ${direction}${f.latest_note ? ` — Note: "${f.latest_note}"` : ''}`
          })
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
