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
    SELECT id, name, description, grading_notes, weight
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
    .map((c) => `--- ID ${c.id}: "${c.name}"\n${c.grading_notes || c.description}`)
    .join('\n\n')

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

SCORING ALGORITHM — follow exactly for every criterion:
1. Each criterion has sub-criteria with point values (e.g. [4pts], [3pts]) that total 10.
2. For each sub-criterion: only score it if you can CLEARLY and DIRECTLY see that specific detail (e.g. thumb position, palm contact, individual finger roll). If you are guessing, inferring, or the detail is obscured by camera distance, angle, or blur — skip it. Do not score what you cannot plainly see.
3. Calculate: (sum of visible sub-scores) ÷ (sum of visible sub-maxes) × 10 = final score, rounded to 1 decimal.
4. Only assign a final score if visible sub-criteria represent at least 60% of total points AND you are confident. If not, set score to null — an honest null is always better than a guessed score.
5. When something IS clearly visible and looks excellent, give full marks for that sub-criterion. Do not hold back. A perfect arc should score 10. Perfect backspin should score 10. Only deduct when you can clearly see a flaw.
6. In your reasoning, show what you saw and the breakdown (e.g. "Elbow under ball [4/4], forearm vertical [3/4], angle [1/2] — 8/10 visible → 8.0").

For the overall_score, average only the criteria you scored (exclude nulls).

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
    max_tokens: 4000,
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
