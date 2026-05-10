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
You will receive ${n} sequential frames from a basketball shot. Use this frame map to know where to look for each criterion:

- Frames 1–${earlyEnd} (SETUP): stance, foot position, knees bent, squareness to basket, shot pocket, elbow L-shape, grip/thumb/palm/guide hand placement
- Frames ${earlyEnd + 1}–${midEnd} (RELEASE): source of power, one-hand release, two-finger release, guide hand separation, elbow alignment at release
- Frames ${midEnd + 1}–${n} (FOLLOW-THROUGH): shooting hand follow-through (goose neck), guide hand follow-through, ball rotation/backspin, shot arc, forward motion and toes

SCORING ALGORITHM — follow exactly for every criterion:
1. Each criterion has sub-criteria with point values (e.g. [4pts], [3pts]) that total 10.
2. SCORE EVERYTHING YOU CAN SEE. The default is to give a score. Only return null if a criterion is completely unassessable — the body part is fully out of frame or the shot angle makes it impossible to see anything relevant. If you can see the player shooting at all, most criteria should get a score.
3. For each sub-criterion:
   - Visible → score from FULL marks, deduct only for clear obvious flaws you can point to
   - Not visible at all → skip that sub-criterion only (do not null the whole criterion unless 50%+ of points are unassessable)
   - Visibly wrong → deduct proportional to how bad it looks
4. Use this scale accurately:
   - 10: Perfect execution on this criterion
   - 9: Near perfect, tiny details only
   - 8–8.5: Very good, clearly strong mechanics, minor issues
   - 7–7.5: Good, solid fundamentals, some room to improve
   - 5–6: Average, clear issues
   - 3–4: Bad form, obvious mistakes
   - 1–2: Fundamentally wrong mechanics
   Good overall form lands ~7. Strong mechanics = 8+. Perfect arc, perfect rotation, perfect follow-through = 10. Do not cap good things at 8 when they are clearly excellent.
5. Calculate: (sum of scored sub-scores) ÷ (sum of scored sub-maxes) × 10 = final score, rounded to 1 decimal.
6. For ball rotation and shot arc: only assess during the ball's clean forward flight. Ignore frames where the ball has hit the rim or backboard.
7. In your reasoning, show what you saw and the breakdown (e.g. "Elbow under ball [4/4], forearm vertical [3/4], angle not visible [skipped] — 8/8 scored → 10.0").

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
