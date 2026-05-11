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

type PlayerType = 'child' | 'recreational' | 'college_pro' | 'nba_bad_form' | 'nba_decent' | 'nba_elite'

interface AnalysisResult {
  overall_score: number
  player_assessment: {
    player_type: PlayerType
    player_name: string | null
  }
  critical_flags: {
    elbow_severely_out: boolean
    followthrough_flick_to_side: boolean
  }
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

  const systemPrompt = `You are an expert basketball shooting coach analyzing a player's shooting form. You have deep knowledge of proper shooting mechanics as taught by top coaches:

KEY FORM PRINCIPLES (use these to evaluate):
- Elbow: must be under the ball forming an L-shape, pointing toward basket — elbow flared out to the side is a major flaw that destroys shot accuracy
- Guide hand: stays on the side of the ball only, comes off first, adds NO force — guide hand pushing, flicking outward, or collapsing inward during release is a significant flaw
- Shooting hand follow-through: wrist snaps fully downward (goose-neck), fingers point toward rim, palm faces floor — hand flicking sideways rather than straight toward basket is a major flaw
- Shot arc: approximately 45-60 degrees, high soft arc — flat shots lack forgiveness and are a clear mechanical flaw
- Release: ball rolls off index and middle fingertips with backspin — palm contact reduces control
- Power: flows from legs upward through core, not arm-muscled
- One-hand release: shooting hand controls everything at release — two-hand push is a clear flaw

You will receive ${n} sequential frames. Frame guide:
- Frames 1–${earlyEnd}: SETUP — stance, knees, shot pocket, elbow, guide hand, thumb, palm
- Frames ${earlyEnd + 1}–${midEnd}: RELEASE — power, one-hand release, two-finger release, guide hand separation
- Frames ${midEnd + 1}–${n}: FOLLOW-THROUGH — wrist snap, guide hand finish, arc, forward motion

Scoring criteria (read each carefully before scoring):
${criteriaText}
${feedbackText}

HOW TO SCORE:

Use the sub-criteria breakdown in each criterion's grading guide. Score each sub-criterion individually, then calculate using the formula shown. Only deduct for flaws you can clearly and confidently see. If you cannot clearly see a specific sub-criterion, give it FULL credit — do not mention it as a limitation.

VISIBILITY RULE (null decisions only): If a criterion cannot be assessed AT ALL because the relevant body part or ball position is not clearly visible in any frame, return null. This null rule is unchanged — keep making the same judgment calls you normally would about when something is completely unassessable.

WITHIN A SCORED CRITERION — DO NOT CITE VISIBILITY AS A DEDUCTION REASON: Once you decide to score a criterion (not null), score purely based on what you can clearly see. For any sub-criterion you cannot clearly assess, give full credit and do not mention it. Never write "hard to confirm," "limited at this distance," or "cannot fully see" as a reason to take points off. If you can see enough to score the criterion, you can see enough to give full credit where there is no visible flaw.

CATCH-AND-SHOOT: If the player catches a pass before shooting, identify catch frames (another player/hand visible passing, ball arriving, player still rotating to face basket) and ignore them completely. The elbow being out during a catch is normal. Only evaluate from when the player has the ball fully in control and is facing the basket.

SCALE:
- 10 = no visible flaws
- 9 = one small clearly visible detail off
- 8–8.5 = minor clearly visible issue
- 7–7.5 = decent, clear room to improve
- 5–6 = obvious problems
- 3–4 = poor, obvious mistakes
- 1–2 = fundamentally wrong

PLAYER ASSESSMENT — identify one of these player_type values:
- "child": player clearly looks under 15 (noticeably young, smaller frame)
- "recreational": adult recreational player
- "college_pro": looks like a college or professional player (tall/athletic build, pro-level court or gear, clearly elite body)
- "nba_bad_form": you can identify this as a known NBA player with notoriously poor shooting mechanics (e.g. Shaquille O'Neal, Shawn Marion, Ben Simmons)
- "nba_decent": you can identify this as an NBA player with acceptable shooting form
- "nba_elite": you can identify this as an NBA player known for exceptional shooting (e.g. Stephen Curry, Devin Booker, Ray Allen, Klay Thompson, Kevin Durant, Damian Lillard)
Include player_name if you can identify the specific person, otherwise null.

CRITICAL FLAGS — set to true only if clearly and obviously present:
- elbow_severely_out: the shooting elbow is dramatically far out to the side during the shot — not just slightly off but clearly well outside the ball line
- followthrough_flick_to_side: the shooting hand OR guide hand clearly flicks/pushes sideways (to the left or right) during or after release — a clear lateral deviation, not straight toward the basket

For overall_score: average only scored criteria (exclude nulls).

Return ONLY valid JSON, no other text:
{
  "overall_score": <average of scored criteria, 1-10, one decimal>,
  "player_assessment": {
    "player_type": "<child|recreational|college_pro|nba_bad_form|nba_decent|nba_elite>",
    "player_name": <string or null>
  },
  "critical_flags": {
    "elbow_severely_out": <true|false>,
    "followthrough_flick_to_side": <true|false>
  },
  "criteria": [
    { "id": <criterion_id>, "score": <1-10 or null>, "reasoning": "<1-2 sentences>" },
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

  const result = JSON.parse(jsonMatch[0]) as AnalysisResult

  // Recalculate overall from criteria scores
  const scored = result.criteria.filter(c => c.score !== null)
  if (scored.length > 0) {
    result.overall_score = Math.round(
      (scored.reduce((sum, c) => sum + (c.score as number), 0) / scored.length) * 10
    ) / 10
  }

  // Apply critical flag caps FIRST
  const flagsTriggered = result.critical_flags.elbow_severely_out || result.critical_flags.followthrough_flick_to_side
  if (result.critical_flags.elbow_severely_out) {
    result.overall_score = Math.min(result.overall_score, 6.0)
  }
  if (result.critical_flags.followthrough_flick_to_side) {
    result.overall_score = Math.min(result.overall_score, 7.0)
  }

  // Apply player type adjustments
  const pt = result.player_assessment?.player_type ?? 'recreational'
  let multiplier = 1.0
  let minimumScore: number | null = null

  if (pt === 'child') {
    multiplier = 0.9
  } else if (pt === 'college_pro') {
    multiplier = 1.1
  } else if (pt === 'nba_decent') {
    multiplier = 1.1
    if (!flagsTriggered) minimumScore = 8.5
  } else if (pt === 'nba_elite') {
    multiplier = 1.1
    if (!flagsTriggered) minimumScore = 9.5
  }
  // nba_bad_form and recreational: no adjustment

  result.overall_score = Math.round(result.overall_score * multiplier * 10) / 10
  if (minimumScore !== null) {
    result.overall_score = Math.max(result.overall_score, minimumScore)
  }
  result.overall_score = Math.min(10, result.overall_score)

  return result
}
