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
    arc_too_flat: boolean
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
- Dominant foot: the shooting-side foot being SLIGHTLY ahead is CORRECT form — this should score 9–10, not be penalized. Only deduct if feet are completely even or the wrong foot is leading.

You will receive ${n} sequential frames. Frame guide:
- Frames 1–${earlyEnd}: SETUP — stance, knees, shot pocket, elbow, guide hand, thumb, palm
- Frames ${earlyEnd + 1}–${midEnd}: RELEASE — power, one-hand release, two-finger release, guide hand separation
- Frames ${midEnd + 1}–${n}: FOLLOW-THROUGH — wrist snap, guide hand finish, arc, forward motion

Scoring criteria (read each carefully before scoring):
${criteriaText}
${feedbackText}

HOW TO SCORE:

Use the sub-criteria breakdown in each criterion's grading guide. Score each sub-criterion individually, then calculate using the formula shown.

BURDEN OF PROOF — deductions require evidence of a visible flaw: You need to clearly see something wrong to deduct points. Not being able to perfectly confirm something is correct is NOT a flaw. Default to full credit; only deduct when you can describe the specific flaw you observed.

MANDATORY 10 RULE: If you cannot name a specific visible flaw, the score is 10 — not 9 "to be safe," not 9.5. A score below 10 requires you to state exactly what was wrong. Never give 9 as a hedge when everything looks correct. 9 means you saw one small specific thing off; if you didn't see that thing, the score is 10.

CONSISTENCY CHECK (apply before finalizing every score): If your reasoning for a criterion describes good mechanics, no flaws, or nothing wrong — the score MUST be 10. A positive or neutral reasoning combined with a score below 10 is a direct contradiction. Fix the score to 10, not the reasoning.

VISIBILITY RULE (null decisions only): If a criterion cannot be assessed AT ALL because the relevant body part or ball position is not clearly visible in any frame, return null. This is the only place visibility matters.

WITHIN A SCORED CRITERION — VISIBILITY IS NEVER A DEDUCTION REASON: Once you decide to score a criterion (not null), only clearly visible flaws count. The following phrases are FORBIDDEN as justification for any deduction — if you find yourself writing them, change the score to 10 for that criterion: "partially visible," "hard to confirm," "limited at this distance," "cannot fully see," "could not clearly confirm," "may be slightly off," "not fully clear," "difficult to assess," "angle makes it hard," "thumb not fully visible," "cannot confirm thumb," "grip hard to see." If your reasoning contains any of these, you are violating the rules.

FOLLOW-THROUGH — ARMS DROPPING DOWN IS NOT A FLAW: After the ball leaves the hand, it is completely normal for both arms to drop down and move apart from each other as the player returns to rest. This must NEVER be scored as a flaw on any follow-through, guide hand, or one-hand-release criterion. Only deduct for those criteria if there is a visible INWARD snap or lateral flick AT the moment of release — not for the natural lowering of both arms afterward.

CAMERA ANGLE — ELBOW ASSESSMENT: When the video is filmed from the side (player facing left or right), a side view can make the elbow appear further out than it really is. Use your best judgment — if the arm forms a clear L-shape with the elbow tucked under the ball even from the side view, give full credit. Only penalize or flag elbow_severely_out if the elbow looks clearly wrong even accounting for the side angle — do not assume it is out simply because the angle is imperfect.

CATCH-AND-SHOOT: If the player catches a pass before shooting, identify catch frames (another player/hand visible passing, ball arriving, player still rotating to face basket) and ignore them completely. The elbow being out during a catch is normal. Only evaluate from when the player has the ball fully in control and is facing the basket.

SCALE:
- 10 = no visible flaws (default when nothing is clearly wrong)
- 9 = one small specific thing clearly visible and slightly off — you must name it
- 8–8.5 = one minor clearly visible issue
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

CRITICAL FLAGS — these operate on their own detection standard, independent of visibility rules above. Look hard for both in every analysis:

- elbow_severely_out: the shooting elbow is noticeably out to the side rather than under the ball. Set true if the elbow is visibly outside the ball line at any point during the shot. This is extremely common — if you are unsure, set true. Do NOT apply benefit-of-the-doubt or burden-of-proof here. When true: the elbow L-shape criterion MUST score 5 or below (floor rules in that criterion's grading guide do not apply).

- followthrough_flick_to_side: the shooting hand OR guide hand makes a lateral movement at the moment of release. These are two distinct patterns — look for BOTH:
  • GUIDE HAND flick: at release, the guide hand snaps or flicks toward the shooting hand side (inward, across the body) rather than cleanly separating straight off.
  • SHOOTING HAND flick: at the exact release moment, the shooting hand briefly flicks toward the guide hand side (or away from the basket), then quickly self-corrects back to a normal-looking follow-through. The FINAL follow-through position may look correct — this does NOT mean there was no flick. The flick happens fast at release and is usually unconscious; players often don't know they do it.
  SIDE-ANGLE TELL: when filmed from the side, both hands flicking toward each other at release is visible as the arms/hands moving inward toward each other — they may even appear to cross or overlap momentarily at the release point. This crossing or convergence of the two hands at release is a strong indicator that both the shooting hand and guide hand are flicking.
  WHAT IS NOT A FLICK: hands/arms moving DOWN or AWAY from each other (spreading apart, returning to rest) after release is normal and must NEVER be flagged. Only flag when the hands move TOWARD each other — converging, closing the gap, or crossing — at the moment of release. Divergence = fine. Convergence = flick.
  TIMING: the flick must occur within approximately 0.3 seconds of the ball leaving the hand. Arms drifting or dropping to the sides after that is normal post-shot follow-through, not a flick. Only flag lateral movement that happens immediately at or just after release — not the natural lowering of the arms after the shot is complete.
  SEVERITY — set this flag ONLY for significant flicks where the hands clearly and substantially converge toward each other, nearly or actually crossing. When true, apply caps ONLY to the hand that flicked:
  • If the GUIDE HAND flicked: "Guide Hand Follow Through" and "Shooting Through Guide Hand / One Hand Release" MUST score 4 or below. "Shooting Hand Follow Through" is NOT affected.
  • If the SHOOTING HAND flicked: "Shooting Hand Follow Through" MUST score 4 or below. "Guide Hand Follow Through" is NOT affected.
  • If BOTH flicked: all three criteria cap at 4 or below.
  MINOR FLICK (do NOT set flag): if the shooting hand shows only a small, brief lateral movement at release that does not amount to significant convergence or near-crossing — mention it in the reasoning for the relevant criterion and score around 7–8, but leave this flag false.
  CHECK EVERY RELEASE FRAME carefully — not just the final follow-through frame. Look at the 2–3 frames right at release for any lateral hand deviation or arm convergence.

- arc_too_flat: the ball travels on a low, flat trajectory rather than a proper high arc (45–60 degrees). If the ball visibly shoots out nearly flat or at a shallow angle with little height, set true. A flat shot has almost no arc and the ball comes in at a low angle toward the basket. Do NOT apply benefit-of-the-doubt here. When true: the shot arc criterion MUST score 4 or below.

NOTE: These flags are the most important flaws to detect. Missing them is a bigger error than a false positive. When in doubt, flag it.

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
    "followthrough_flick_to_side": <true|false>,
    "arc_too_flat": <true|false>
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

  // Ensure new flag fields default to false if missing from response
  result.critical_flags.arc_too_flat = result.critical_flags.arc_too_flat ?? false

  // Recalculate overall from criteria scores
  const scored = result.criteria.filter(c => c.score !== null)
  if (scored.length > 0) {
    result.overall_score = Math.round(
      (scored.reduce((sum, c) => sum + (c.score as number), 0) / scored.length) * 10
    ) / 10
  }

  // Apply critical flag caps FIRST — stacking penalties for multiple flaws
  const { elbow_severely_out, followthrough_flick_to_side, arc_too_flat } = result.critical_flags
  const flagCount = [elbow_severely_out, followthrough_flick_to_side, arc_too_flat].filter(Boolean).length
  const flagsTriggered = flagCount > 0
  if (flagCount >= 3) {
    result.overall_score = Math.min(result.overall_score, 5.0)
  } else if (flagCount === 2) {
    result.overall_score = Math.min(result.overall_score, 5.5)
  } else if (flagCount === 1) {
    result.overall_score = Math.min(result.overall_score, 6.0)
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
