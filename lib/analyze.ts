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
    HAVING COUNT(*) >= 1
    ORDER BY ABS(AVG(cs.admin_score - cs.ai_score)) DESC
  `

  // Recent individual corrections with notes — captures grading style and reasoning
  const recentCorrections = await db`
    SELECT c.name, cs.ai_score, cs.admin_score, cs.admin_notes
    FROM criterion_scores cs
    JOIN criteria c ON cs.criterion_id = c.id
    WHERE cs.admin_score IS NOT NULL
    ORDER BY cs.id DESC
    LIMIT 20
  `

  const criteriaText = activeCriteria
    .map((c) => `--- ID ${c.id}: "${c.name}"\n${c.grading_notes || c.description}`)
    .join('\n\n')

  const calibrationLines = calibration.map((f) => {
    const drift = Number(f.avg_drift)
    const direction =
      drift > 0
        ? `you score ${Math.abs(drift).toFixed(1)} pts too LOW — be more generous`
        : `you score ${Math.abs(drift).toFixed(1)} pts too HIGH — be stricter`
    return `- "${f.name}" (${f.corrections} correction${Number(f.corrections) > 1 ? 's' : ''}): ${direction}${f.latest_note ? ` — "${f.latest_note}"` : ''}`
  })

  const recentLines = recentCorrections
    .filter((r) => r.admin_notes)
    .map((r) => `- "${r.name}": scored ${r.ai_score} → corrected to ${r.admin_score} — "${r.admin_notes}"`)

  const feedbackText = calibrationLines.length > 0 || recentLines.length > 0
    ? '\n\nEXPERT GRADING CALIBRATION — This is how the expert grades. Study these corrections and apply the same judgment to your scoring:\n' +
      (calibrationLines.length > 0 ? 'Score drift per criterion:\n' + calibrationLines.join('\n') : '') +
      (recentLines.length > 0 ? '\n\nRecent corrections with reasoning (apply this grading style):\n' + recentLines.join('\n') : '')
    : ''

  const n = frameBase64Array.length
  const earlyEnd = Math.round(n * 0.4)
  const midEnd = Math.round(n * 0.7)

  const systemPrompt = `You are an expert basketball shooting coach analyzing a player's shooting form.
You will receive ${n} sequential frames. Frame guide:
- Frames 1–${earlyEnd}: SETUP — stance, knees, shot pocket, elbow L-shape, guide hand, thumb, palm
- Frames ${earlyEnd + 1}–${midEnd}: RELEASE — power, one-hand release, two-finger release, guide hand separation
- Frames ${midEnd + 1}–${n}: FOLLOW-THROUGH — wrist snap, guide hand finish, ball rotation, arc, forward motion

Scoring criteria (read each carefully before scoring):
${criteriaText}
${feedbackText}

NOW SCORE EACH CRITERION USING THESE EXACT RULES:

RULE 1 — CERTAINTY REQUIRED TO DEDUCT. If your reasoning includes words like "may", "might", "slight indication", "possibly", "appears to", "seems like" — that is NOT certain enough to deduct points. Only deduct when you can state clearly and confidently what the flaw is. Uncertainty = no deduction.

RULE 2 — EXCEPTIONS (null if not clearly visible up close):
- ID 2 "Thumb is Spread Wide": null if thumb not clearly visible
- ID 4 "Palm Non-Contact": null if palm/finger pads not clearly visible

RULE 3 — CATCH-AND-SHOOT VIDEOS: If the player catches a pass, completely ignore all frames from the catch itself and any adjustment period immediately after. Only begin evaluating once the player has settled and is in their actual shooting stance loading up. The catch position is irrelevant.

RULE 4 — ELBOW L-SHAPE (ID 5): Scan all frames AFTER the catch is complete. Find the single best frame where the elbow forms an L. If you can see an L-shape at ANY point during the actual shot (not catch), score it based on that best frame. Score high if the L is visible at all.

RULE 5 — SHOT POCKET (ID 6): Score the loading position AFTER the catch and BEFORE the upward motion. Ignore where the ball is during the catch. Only evaluate the intentional loading position.

RULE 6 — FOLLOW-THROUGH DIRECTION (ID 15): Only deduct if follow-through direction is CLEARLY and OBVIOUSLY wrong. If you are not certain, give full marks.

RULE 7 — GUIDE HAND (ID 3, 16): Only penalize if pushing or flicking is clearly confirmed. If you say "may flick" or "slight indication" — that is not confirmed, give full marks.

RULE 8 — ARC/ROTATION: only assess during clean forward flight, not after rim or backboard contact.

RULE 9 — SCALE (each criterion scored independently):
- 10 = perfect, no visible flaws
- 9 = near perfect, tiny details only
- 8–8.5 = very good, minor issues
- 7–7.5 = good, some room to improve
- 5–6 = average, clear issues
- 3–4 = bad, obvious mistakes
- 1–2 = fundamentally wrong

RULE 10 — SUB-CRITERIA MATH: score from full marks down, deduct only for clearly visible flaws. Calculate: (scored points) ÷ (scoreable points) × 10.

For overall_score: average only scored criteria (exclude nulls).

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
