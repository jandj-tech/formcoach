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

// Hedging language means the model reconstructed a score instead of observing
// one. Arc and rotation are the two it guesses at most — the ball is usually
// out of frame or a blur — and a guessed number lands in the weighted average
// and drags the whole report off. Any hedged reasoning on those two forces the
// score to null. Deliberately NOT included: "approximately", "roughly",
// "estimated". Arc angle is inherently an estimate of magnitude, and the rubric
// itself says "approximately 45-60 degrees" — matching those would null every
// arc score, including the well-observed ones.
const GUESS_PATTERNS: RegExp[] = [
  /\bappear(?:s|ed|ing)?\b/,
  /\bseem(?:s|ed|ing)?\b/,
  /\blikely\b/,
  /\bprobabl[ey]\b/,
  /\bpresumabl[ey]\b/,
  /\bpresumed\b/,
  /\bapparently\b/,
  /\bassum(?:e|es|ed|ing|ption)\b/,
  /\binfer(?:s|red|ring)?\b/,
  /\bimpl(?:y|ies|ied)\b/,
  /\bsuggest(?:s|ed|ing)?\b/,
  /\bconsistent with\b/,
  /\bmay (?:be|have)\b/,
  /\bmight (?:be|have)\b/,
  /\bcould (?:be|have)\b/,
  /\bwould (?:be|have)\b/,
  /\bhard to (?:tell|see|judge|assess|confirm)\b/,
  /\bdifficult to (?:tell|see|judge|assess|confirm)\b/,
  /\bcan(?:no|')?t (?:fully |clearly |really )?(?:tell|see|confirm)\b/,
  /\bnot (?:fully|entirely|clearly) (?:visible|clear|confirmed)\b/,
  /\bpartially visible\b/,
  /\bpartly visible\b/,
  /\blimited (?:view|visibility)\b/,
  /\bbased on (?:the )?trajectory\b/,
  /\bunclear\b/,
  /\bnot clear\b/,
  /\bblur/,
  /\blow resolution\b/,
  /\btoo far\b/,
  /\bat this distance\b/,
]

function readsLikeAGuess(reasoning: string): boolean {
  const r = (reasoning || '').toLowerCase()
  return GUESS_PATTERNS.some((p) => p.test(r))
}

// Shown in place of the model's own wording whenever we strip a guessed score,
// so the card never reads as a confident judgement with no number beside it.
// The UI pairs this with a link to the filming guide.
const UNGRADED_ARC =
  `The ball's flight to the basket wasn't clear enough in this clip to judge arc, so it was left ungraded rather than guessed at. It does not count against your score.`
const UNGRADED_ROTATION =
  `The ball's spin wasn't clear enough in this clip to judge rotation, so it was left ungraded rather than guessed at. It does not count against your score.`
const UNGRADED_TWO_FINGER =
  `The fingers at the exact release moment weren't clear enough in this clip to judge, so this was left ungraded rather than guessed at. It does not count against your score.`

type PlayerType = 'child' | 'recreational' | 'college_pro' | 'nba_bad_form' | 'nba_decent' | 'nba_elite'

interface AnalysisResult {
  overall_score: number
  shot_detected: boolean
  player_assessment: {
    player_type: PlayerType
    player_name: string | null
  }
  critical_flags: {
    elbow_severely_out: boolean
    followthrough_flick_to_side: boolean
    arc_too_flat: boolean
    chest_pass_hands: boolean
  }
  criteria: CriterionResult[]
}

async function analyzeShotOnce(
  frameBase64Array: string[],
  frameMimeTypes: string[],
  opts?: { model?: string; thinking?: 'disabled' | 'adaptive' }
): Promise<{ result: AnalysisResult; activeCriteria: CriteriaRow[] }> {
  const model = opts?.model || process.env.ANALYSIS_MODEL || 'claude-sonnet-4-6'
  const thinkingMode = opts?.thinking || 'disabled'
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
- Elbow: must form a VERTICAL L-shape — forearm pointing straight up toward the ceiling, elbow pointing straight down toward the floor, directly under the ball. A sideways L (arm reaching out to the side with elbow bent, forearm going sideways rather than straight up) is NOT correct form and scores 0-2, the same as an elbow completely out. Only a vertical L with the forearm going straight up counts as good elbow position.
- Guide hand: stays on the side of the ball only, comes off first, adds NO force — guide hand pushing, flicking outward, or collapsing inward during release is a significant flaw
- Shooting hand follow-through: wrist snaps fully downward (goose-neck), fingers point toward rim, palm faces floor — hand flicking sideways rather than straight toward basket is a major flaw
- Shot arc: approximately 45-60 degrees, high soft arc — flat shots lack forgiveness and are a clear mechanical flaw
- Release: ball rolls off index and middle fingertips with backspin — palm contact reduces control
- Power: flows from legs upward through core, not arm-muscled
- One-hand release: shooting hand controls everything at release — two-hand push is a clear flaw
- Stance: a correct base puts the feet between hip width and shoulder width; clearly narrower or clearly wider are both real flaws. Judge it only as the player rises into the shot, never before. Its grading guide below carries the full method — follow that. In player-facing reasoning always call this "shoulder width" — never write "hip width"
- Dominant foot: the shooting-side foot being SLIGHTLY ahead is CORRECT form — this should score 9–10, not be penalized. Only deduct if feet are completely even or the wrong foot is leading.

You will receive ${n} sequential frames covering one shot. They are NOT split evenly between the phases of that shot, so never assume a fixed frame range is a given phase. Read the sequence and locate these three moments yourself:

  MOMENT 1 — THE RISE. Starts when the player has the ball under control, knees dipped, and begins driving upward. Runs to the top of the lift. Everything BEFORE this — standing still, catching a pass, dribbling, walking or turning into position — is not part of the shot and must never be scored.
  MOMENT 2 — THE APEX. The arm at full extension, the ball at the top of the release, leaving the fingertips.
  MOMENT 3 — THE FOLLOW-THROUGH. The two or three frames immediately AFTER the ball has left the hand. Not later than that.

JUDGE EACH CRITERION ONLY AT ITS OWN MOMENT — a criterion scored off the wrong moment is the single most common cause of a wrong score:
- Feet shoulder width apart, knees bent, dominant foot forward, square to the basket: MOMENT 1 ONLY. The base and the lower body are judged as the player goes up, never from an earlier frame where they are still standing around.
- Shot pocket, elbow L-shape, guide hand placement, thumb spread, palm off the ball: MOMENT 1 THROUGH MOMENT 2 — the hands and arms as they rise, and again at the apex.
- Source of power, one-hand release, two-finger release, guide hand separation: MOMENT 2.
- Shooting hand follow-through, guide hand follow-through, forward motion and toes: MOMENT 3 — right after the ball leaves the hand and the next couple of frames.
- Shot arc, ball rotation: the ball in flight after release.
- Connected shot: the sequence as a whole.
- The landing, which only affects the stance criterion: the first frames where both feet are back on the floor, if that happens before the clip ends.

Frames ${earlyEnd + 1}–${midEnd} usually contain the apex and frames ${midEnd + 1}–${n} usually contain the follow-through, but treat that only as a rough hint — what the player is actually doing in the frame always wins over its number.

Scoring criteria (read each carefully before scoring):
${criteriaText}
${feedbackText}

HOW TO SCORE:

STEP 0 — Before scoring anything, confirm these frames actually show a real shot being taken (see SHOT DETECTION below). If they do not, set shot_detected to false and do not score the criteria — producing a score for a clip that contains no shot is never acceptable.

Use the sub-criteria breakdown in each criterion's grading guide. Score each sub-criterion individually, then calculate using the formula shown.

BURDEN OF PROOF — deductions require evidence of a visible flaw: You need to clearly see something wrong to deduct points. Not being able to perfectly confirm something is correct is NOT a flaw. Default to full credit; only deduct when you can describe the specific flaw you observed.

MANDATORY 10 RULE: If you cannot name a specific visible flaw, the score is 10 — not 9 "to be safe," not 9.5. A score below 10 requires you to state exactly what was wrong. Never give 9 as a hedge when everything looks correct. 9 means you saw one small specific thing off; if you didn't see that thing, the score is 10.

A CLEAN FINISH NEVER RESCUES A BROKEN SET POINT. The follow-through and the flight of the ball are the most eye-catching part of a clip, and a tidy goose-neck finish — or the ball going in — makes the whole shot read as good. It does not make the set point good. Inspect the frames where the ball is coming up and level with the head, BEFORE it is released, and score the arm on what you see THERE. If the elbow is flared out, the arm is opened into a V rather than folded into an L, or the ball is sitting beside the head instead of stacked above the elbow, then the elbow, shot pocket and power criteria are all low — no matter how clean the release and follow-through look afterwards. A shot can finish beautifully and still have been built wrong, and the pre-release frames are the only place that shows.

CONSISTENCY CHECK (apply before finalizing every score): If your reasoning for a criterion describes good mechanics, no flaws, or nothing wrong — the score MUST be 10. A positive or neutral reasoning combined with a score below 10 is a direct contradiction. Fix the score to 10, not the reasoning.

USER-FACING LANGUAGE RULE: The "reasoning" string is shown directly to the player. Write it as natural, plain-English coaching feedback — say what they did wrong and how to correct it. NEVER mention internal flag names like elbow_severely_out, followthrough_flick_to_side, arc_too_flat, chest_pass_hands, or critical_flags. NEVER write meta-phrases like "flag triggered," "cap applied," "score capped at X," or "per the rules." NEVER write "hip width" — stance width is measured against the hips internally, but players are only ever taught the "shoulder width" cue, so always word stance feedback as "shoulder width." Just describe the flaw and a tip to fix it, the way a coach would speak to a player.

VISIBILITY RULE (null decisions only): If a criterion cannot be assessed AT ALL because the relevant body part or ball position is not clearly visible in any frame, return null. This is the only place visibility matters.

NEVER GUESS — AN ESTIMATE IS NOT A SCORE: A score must come from something you actually watched happen in these frames. If producing a number would require you to assume, infer, extrapolate, or fill in a gap the footage does not show, return null instead. A null costs the player nothing — it is dropped from the average entirely — but a guessed score corrupts their overall number and the feedback they read, which is far worse than leaving a criterion blank. Whenever you are caught between "I can see this" and "this is probably what happened," the answer is null. This applies to every criterion, and it applies hardest to SHOT ARC and BALL ROTATION: both depend entirely on the ball being trackable in the air, both are invisible from most camera angles, and both are the ones most often guessed at from a good-looking release. Do not score them off the release. Score them off the ball.

SHOT ARC — RIM OR NET CONTACT REQUIRED: You may only score arc if you can clearly see the ball physically contact the rim (backboard, rim, or glass) OR visibly touch the mesh of the net. If you cannot see the ball make contact with the rim or net mesh — even if you think it went in, even if you can see the basket — return null. Trajectory alone is never enough, and you must never reconstruct the arc from the direction the ball was travelling when it left the frame. The ball must visibly interact with the basket hardware or net. If the ball disappears before reaching the rim, or you only see the basket from a distance without visible ball-rim/net contact, return null.

BALL ROTATION — THE SPIN MUST BE SEEN, NOT ASSUMED: Two conditions must BOTH hold before you may score ball rotation. First, shot arc must have received a score — if arc is null the ball was never tracked in flight, so rotation is unknowable and must also be null. Second, you must have actually SEEN the ball turning over: the seams, logo, or markings rotating across consecutive in-flight frames. Backspin is never implied by a clean release, a good follow-through, or the ball going in — plenty of badly spinning balls go in, and a textbook goose-neck tells you nothing about what the ball actually did. If the ball is a blur, too small, too far away, or you only have one usable frame of it in the air, you cannot see the spin: return null. If the strongest thing you can say is that the rotation "appears" or "looks like" clean backspin, that is a guess — return null instead.

SHOT ARC / BALL ROTATION / TWO FINGER RELEASE — NEVER GUESS, NULL INSTEAD: these three criteria depend on clearly seeing the ball in flight or the fingers at the exact release frame. If you cannot see them CLEARLY, the answer is null — never a middle score. Giving a 4–7 with reasoning like "appears to", "seems", "hard to tell", or "partially visible" is a violation of this rubric: either you clearly saw it and score what you saw, or you did not and you return null. There is no in-between score for poor visibility.

THUMB — MANDATORY NULL CONDITION: Return null for the "Thumb is Spread Wide" criterion if the thumb is not clearly and directly visible in at least one frame. Do not infer thumb position from finger spacing or general hand shape — if you cannot see the thumb clearly, return null.

WITHIN A SCORED CRITERION — VISIBILITY IS NEVER A DEDUCTION REASON: Once you decide to score a criterion (not null), only clearly visible flaws count. The following phrases are FORBIDDEN as justification for any deduction — if you find yourself writing them, change the score to 10 for that criterion: "partially visible," "hard to confirm," "limited at this distance," "cannot fully see," "could not clearly confirm," "may be slightly off," "not fully clear," "difficult to assess," "angle makes it hard," "thumb not fully visible," "cannot confirm thumb," "grip hard to see." If your reasoning contains any of these, you are violating the rules.

FOLLOW-THROUGH — ARMS DROPPING DOWN IS NOT A FLAW: After the ball leaves the hand, it is completely normal for both arms to drop down and move apart from each other as the player returns to rest. This must NEVER be scored as a flaw on any follow-through, guide hand, or one-hand-release criterion. Only deduct for those criteria if there is a visible INWARD snap or lateral flick AT the moment of release — not for the natural lowering of both arms afterward.

GUIDE HAND — SCRUTINIZE EVERY RELEASE: The guide (off) hand must leave the ball completely BEFORE the ball leaves the shooting hand, and must add zero force. Examine the release and follow-through frames specifically for the guide hand. A two-hand release — where the guide hand is still on the ball at release, visibly pushes or steers it, or drives upward through the shot so both hands finish high and extended together — is a real and common flaw, and is NOT the same as the natural post-shot arm drop described above. When you see a genuine two-hand release or guide-hand flick, score "Shooting Through Guide Hand / One Hand Release" and "Guide Hand Follow Through" 4 or below and set followthrough_flick_to_side. Do not overlook this — it is one of the most score-relevant flaws, and it is easy to miss from front or elevated camera angles where the two hands overlap.

CAMERA ANGLE — ELBOW ASSESSMENT: When the video is filmed from the side (player facing left or right), a side view can make the elbow appear further out than it really is. Use your best judgment — if the arm forms a clear L-shape with the elbow tucked under the ball even from the side view, give full credit. Only penalize or flag elbow_severely_out if the elbow looks clearly wrong even accounting for the side angle — do not assume it is out simply because the angle is imperfect.

CATCH-AND-SHOOT: If the player catches a pass before shooting, identify catch frames (another player/hand visible passing, ball arriving, player still rotating to face basket) and ignore them completely. The elbow being out during a catch is normal. Only evaluate from when the player has the ball fully in control and is facing the basket.

SCALE (scores must land exactly on a whole or half point — 7, 7.5, 8; never 7.3 or 8.2 — the same shot must always earn the same number):
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

- elbow_severely_out: the shooting elbow is dramatically and unmistakably out to the side at any point from the SET POINT through the release. Only set true for obvious, severe cases — the kind of elbow flaw you would notice immediately even in a small frame.
  THE SET POINT COUNTS, AND THIS IS THE FRAME THAT GETS MISSED. The set point is where the ball has come up to head height and is about to be released. If at that moment the elbow is winged far out to the side, the arm is opened into a wide V instead of a folded L, or the ball is sitting BESIDE THE HEAD rather than stacked above the elbow, set this flag. That is a severe elbow fault and it does not stop being one because the ball has not left the hand yet.
  The narrow exemption is only this: EARLY in the gather, while the ball is still low around the chest and the arm has not yet set, an elbow slightly outside the ball line is biomechanically common and does not trigger the flag. Slightly outside, early, and low — all three. It never excuses a dramatically flared elbow at the set point.
  When true: the elbow L-shape criterion MUST score 4 or below and the overall score is capped.

- followthrough_flick_to_side: the shooting hand OR guide hand makes a lateral movement at the moment of release. These are two distinct patterns — look for BOTH:
  • GUIDE HAND flick: at release, the guide hand snaps or flicks toward the shooting hand side (inward, across the body) rather than cleanly separating straight off.
  • SHOOTING HAND flick: at the exact release moment, the shooting hand briefly flicks toward the guide hand side (or away from the basket), then quickly self-corrects back to a normal-looking follow-through. The FINAL follow-through position may look correct — this does NOT mean there was no flick. The flick happens fast at release and is usually unconscious; players often don't know they do it.
  SIDE-ANGLE TELL: when filmed from the side, both hands flicking toward each other at release is visible as the arms/hands moving inward toward each other — they may even appear to cross or overlap momentarily at the release point. This crossing or convergence of the two hands at release is a strong indicator that both the shooting hand and guide hand are flicking.
  OVERHEAD / HIGH-ANGLE TELL: when filmed from above or a high / elevated broadcast angle, a clean one-hand release shows the shooting hand finishing high and ALONE, with the guide hand already peeled away — lower, relaxed, or off to the side. A guide-hand flick or two-hand release instead shows BOTH hands finishing high, extended and spread together through the follow-through, because the guide hand never cleanly separated from the ball before release. If both hands stay up, open and active as the ball leaves and after it is gone, treat this as a guide-hand flick.
  WHAT IS NOT A FLICK: hands/arms moving DOWN or AWAY from each other (spreading apart, returning to rest) after release is normal and must NEVER be flagged. Only flag when the hands move TOWARD each other — converging, closing the gap, or crossing — at the moment of release. Divergence = fine. Convergence = flick.
  TIMING: the flick must occur within approximately 0.3 seconds of the ball leaving the hand. Arms drifting or dropping to the sides after that is normal post-shot follow-through, not a flick. Only flag lateral movement that happens immediately at or just after release — not the natural lowering of the arms after the shot is complete.
  SEVERITY — set this flag ONLY for significant flicks where the hands clearly and substantially converge toward each other, nearly or actually crossing. When true, apply caps ONLY to the hand that flicked:
  • If the GUIDE HAND flicked: "Guide Hand Follow Through" and "Shooting Through Guide Hand / One Hand Release" MUST score 4 or below. "Shooting Hand Follow Through" is NOT affected.
  • If the SHOOTING HAND flicked: "Shooting Hand Follow Through" MUST score 4 or below. "Guide Hand Follow Through" is NOT affected.
  • If BOTH flicked: all three criteria cap at 4 or below.
  MINOR FLICK (do NOT set flag): if the shooting hand shows only a small, brief lateral movement at release that does not amount to significant convergence or near-crossing — mention it in the reasoning for the relevant criterion and score around 7–8, but leave this flag false.
  CHECK EVERY RELEASE FRAME carefully — not just the final follow-through frame. Look at the 2–3 frames right at release for any lateral hand deviation or arm convergence.

- chest_pass_hands: in any frame from the shot pocket through the rise, the hands are on the ball like a CHEST PASS instead of a shot — both hands symmetrically on the SIDES of the ball, thumbs behind it, elbows flared out away from the body, and no hand underneath supporting the ball. The tell is SYMMETRY: in a real shot the two hands do visibly different jobs, the shooting hand sitting UNDER the ball carrying its weight while the guide hand rests on the side. In a chest-pass grip they mirror each other and the ball is pushed out from the chest by both arms together.
  CHECK THE ELBOWS ON THE WAY UP — this is the second half of the same fault and it must be caught too. As the ball travels from the pocket up toward the set point, the shooting elbow should stay tucked in UNDER the ball, pointing down toward the floor, with the upper arm close to the body. If instead BOTH elbows are winged out to the sides — pointing away from the torso rather than down, chicken-winged — and the ball is being driven upward by both arms together, set this flag. Flared elbows driving the ball up are the same chest-pass fault as the chest-height grip, just later in the motion, and they are just as bad. Check every frame of the rise, not only the pocket.
  THE ELBOW CHECK ONLY APPLIES WHILE THE BALL IS BETWEEN THE POCKET AND THE SET POINT — roughly chest height up to forehead height. Once the arms are extended overhead at the apex or in the follow-through, the elbows are SUPPOSED to be high and pointing up; that is correct form, not flaring. Never set this flag off an apex, release or follow-through frame, and never set it because the arms are raised.
  DO NOT set this flag just because both hands are on the ball — every shot starts that way and two hands on the ball during the gather is completely normal. Set it when EITHER of these is true: the shooting hand is clearly not under the ball and the two hands mirror each other, OR both elbows are flared out to the sides driving the ball up together. A guide-hand elbow sitting at a mild outward angle on its own is normal and is not this flag.
  When true: "Shot Pocket — Elbow", "Source of Shot Power" and "Shooting Through Guide Hand / One Hand Release" MUST each score 4 or below. Pushing the ball from the chest with both hands means it is not loaded in a shot pocket, the power is coming from the arms rather than the legs, and the release cannot be one-handed.

- arc_too_flat: the ball travels on a low, flat trajectory rather than a proper high arc (45–60 degrees). If the ball visibly shoots out nearly flat or at a shallow angle with little height, set true. A flat shot has almost no arc and the ball comes in at a low angle toward the basket. Do NOT apply benefit-of-the-doubt here. When true: the shot arc criterion MUST score 4 or below.

NOTE: These flags are the most important flaws to detect. Missing them is a bigger error than a false positive. When in doubt, flag it.

For overall_score: average only scored criteria (exclude nulls).

SHOT DETECTION — do these specific frames actually show a shot being taken? This is the FIRST thing to decide, before any scoring. Look at the frames as a sequence. To be analyzable, the frames must actually capture the shooting motion of ONE player: gathering the ball, lifting it to a set point, rising or jumping, releasing it, and following through.

Set "shot_detected" to FALSE whenever the frames do NOT clearly show that shooting motion — for example: players running, walking off or up the court, dribbling, passing, playing defense, standing around, or celebrating; the aftermath of a shot with no actual release visible; a wide or TV-broadcast view where the action is far away or there are many players; or any clip where you cannot clearly watch one player take a shot from set-up through release. A person simply being on a basketball court, or simply being a basketball player, is NOT a shot — you must actually SEE the shooting motion happen in these frames.

Set "shot_detected" to TRUE only when you can clearly see a real shot being taken in these frames. If you cannot, you MUST set it false — never produce a score for a clip that does not contain a visible shot. A score on a non-shot clip is a serious error; when the shooting motion is not clearly visible, set false.

Return ONLY valid JSON, no other text:
{
  "shot_detected": <true|false — false ONLY if there is clearly no analyzable shot>,
  "overall_score": <average of scored criteria, 1-10, one decimal>,
  "player_assessment": {
    "player_type": "<child|recreational|college_pro|nba_bad_form|nba_decent|nba_elite>",
    "player_name": <string or null>
  },
  "critical_flags": {
    "elbow_severely_out": <true|false>,
    "followthrough_flick_to_side": <true|false>,
    "arc_too_flat": <true|false>,
    "chest_pass_hands": <true|false>
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
    model,
    max_tokens: 6000,
    // Determinism: identical frames must grade identically. Temperature 0
    // collapses sampling variance; the median-of-N ensemble below absorbs
    // what little remains.
    temperature: 0,
    // Explicit thinking mode: on Sonnet 5, omitting `thinking` silently
    // enables adaptive thinking (extra cost); 'disabled' matches Sonnet
    // 4.6's no-thinking default.
    thinking: { type: thinkingMode },
    // The coaching rubric (~6K tokens) is identical between analyses until an
    // admin correction lands, so cache it: repeat analyses within 5 minutes
    // (team roster sessions especially) read it at ~10% of the input price.
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
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

  // Cost visibility: cache_read should be high on back-to-back analyses.
  console.log('[analyze] usage', {
    model: response.model,
    input: response.usage.input_tokens,
    cacheWrite: response.usage.cache_creation_input_tokens,
    cacheRead: response.usage.cache_read_input_tokens,
    output: response.usage.output_tokens,
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  const text = textBlock?.type === 'text' ? textBlock.text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in Claude response')

  const result = JSON.parse(jsonMatch[0]) as AnalysisResult

  // Default to true so a malformed response never wrongly rejects a real shot.
  result.shot_detected = result.shot_detected ?? true
  // No analyzable shot — return now; the ensemble's majority vote decides.
  if (result.shot_detected === false) {
    return { result, activeCriteria: activeCriteria as unknown as CriteriaRow[] }
  }

  // Ensure new flag fields default to false if missing from response
  result.critical_flags.arc_too_flat = result.critical_flags.arc_too_flat ?? false
  result.critical_flags.chest_pass_hands = result.critical_flags.chest_pass_hands ?? false

  // Arc and rotation are resolved by name rather than by the seed id, because
  // an admin can rename or reorder criteria and these two rules must keep
  // biting. The seed ids stay as the fallback for a renamed criterion.
  const criterionId = (name: string, seedId: number) =>
    (activeCriteria.find((c) => c.name === name)?.id as number | undefined) ?? seedId
  const arcId = criterionId('Shot Arc', 17)
  const rotationId = criterionId('Ball Rotation', 13)

  // Hard-enforce arc null rule in TypeScript — prompt instructions alone are not reliable enough.
  // If the reasoning doesn't contain a confirmed outcome phrase, or contains uncertain language,
  // force the score to null regardless of what Claude returned.
  // Hard-enforce arc rule: reasoning must describe visible rim or net contact.
  const arcCriterion = result.criteria.find(c => c.id === arcId)
  if (arcCriterion && arcCriterion.score !== null) {
    const r = arcCriterion.reasoning.toLowerCase()
    const hasRimOrNetContact =
      r.includes('hit the rim') ||
      r.includes('hits the rim') ||
      r.includes('off the rim') ||
      r.includes('bounced off') ||
      r.includes('hit the backboard') ||
      r.includes('hits the backboard') ||
      r.includes('off the backboard') ||
      r.includes('touch the net') ||
      r.includes('touches the net') ||
      r.includes('through the net') ||
      r.includes('through the hoop') ||
      r.includes('swished') ||
      r.includes('swish') ||
      r.includes('net mesh') ||
      r.includes('went through') ||
      r.includes('goes through') ||
      r.includes('rimmed out') ||
      r.includes('rimmed in') ||
      r.includes('hit the glass') ||
      r.includes('off the glass') ||
      r.includes('clanked') ||
      r.includes('rattled')
    // Two ways to lose the arc score: no visible rim/net contact to anchor it,
    // or reasoning that hedges — both mean the number was reconstructed rather
    // than observed, and a reconstructed number skews the weighted average.
    if (!hasRimOrNetContact || readsLikeAGuess(arcCriterion.reasoning)) {
      arcCriterion.score = null
      arcCriterion.reasoning = UNGRADED_ARC
    }
  }

  // Ball rotation needs the ball tracked in flight. If arc wasn't scored the
  // ball was never followed to the basket, so spin cannot have been seen
  // either; and even when arc holds, hedged rotation wording means the spin was
  // inferred from a clean release rather than watched on the ball.
  const rotationCriterion = result.criteria.find(c => c.id === rotationId)
  if (rotationCriterion && rotationCriterion.score !== null) {
    const arcUnscored = !arcCriterion || arcCriterion.score === null
    if (arcUnscored || readsLikeAGuess(rotationCriterion.reasoning)) {
      rotationCriterion.score = null
      rotationCriterion.reasoning = UNGRADED_ROTATION
    }
  }

  // arc_too_flat caps the overall score on its own, so it must not survive an
  // arc we refused to grade — otherwise dropping the guessed arc score still
  // leaves the guess penalising the player through the flag caps below.
  if (!arcCriterion || arcCriterion.score === null) {
    result.critical_flags.arc_too_flat = false
  }

  // Two Finger Release is the third never-guess criterion: it depends on the
  // fingers at the exact release frame, which most angles can't show. Arc and
  // rotation are handled above with their extra flight-visibility rules.
  const twoFingerCriterion = result.criteria.find(
    c => c.id === criterionId('Two Finger Release', 12)
  )
  if (twoFingerCriterion && twoFingerCriterion.score !== null && readsLikeAGuess(twoFingerCriterion.reasoning)) {
    twoFingerCriterion.score = null
    twoFingerCriterion.reasoning = UNGRADED_TWO_FINGER
  }

  return { result, activeCriteria: activeCriteria as unknown as CriteriaRow[] }
}

interface CriteriaRow { id: number; name: string; weight: unknown }

// Deterministic post-processing shared by every ensemble merge: caps,
// weighted overall, player-type adjustment. Pure function of its inputs.
function finalizeResult(result: AnalysisResult, activeCriteria: CriteriaRow[]): AnalysisResult {
  // If the AI could not assess at least half the criteria, the video was not
  // truly analyzable — too far away, too cluttered, or no clear single shooter.
  // Flag it as "no shot" so the caller cancels the analysis without charging,
  // rather than publishing a score derived from only a handful of criteria.
  const assessableCount = result.criteria.filter((c) => c.score !== null).length
  if (assessableCount < activeCriteria.length / 2) {
    result.shot_detected = false
    return result
  }

  // A chest-pass grip is three flaws at once: the ball was never loaded in a
  // pocket, the power came from the arms, and the release cannot be one-handed.
  // Resolved by name because these ids come from the DB, not the seed order.
  if (result.critical_flags.chest_pass_hands) {
    const chestPassCriteria = [
      'Shot Pocket — Elbow',
      'Source of Shot Power',
      'Shooting Through Guide Hand / One Hand Release',
    ]
    const capIds = activeCriteria
      .filter((c) => chestPassCriteria.includes(c.name as string))
      .map((c) => c.id as number)
    for (const c of result.criteria) {
      if (capIds.includes(c.id) && c.score !== null) {
        c.score = Math.min(c.score as number, 4)
      }
    }
  }

  // Recalculate overall using weighted average (weight column from DB)
  const activeCriteriaRows = activeCriteria as unknown as Array<{ id: number; weight: unknown }>
  const weightMap: Record<number, number> = Object.fromEntries(
    activeCriteriaRows.map((c) => [Number(c.id), Number(c.weight) || 1])
  )
  const scored = result.criteria.filter(c => c.score !== null)
  if (scored.length > 0) {
    const totalWeight = scored.reduce((sum, c) => sum + (weightMap[c.id] ?? 1), 0)
    const weightedSum = scored.reduce((sum, c) => sum + (c.score as number) * (weightMap[c.id] ?? 1), 0)
    result.overall_score = Math.round((weightedSum / totalWeight) * 10) / 10
  }

  // Apply critical flag caps FIRST — stacking penalties for multiple flaws
  const { elbow_severely_out, followthrough_flick_to_side, arc_too_flat, chest_pass_hands } = result.critical_flags
  const flagCount = [elbow_severely_out, followthrough_flick_to_side, arc_too_flat, chest_pass_hands].filter(Boolean).length
  const flagsTriggered = flagCount > 0
  if (flagCount >= 3) {
    result.overall_score = Math.min(result.overall_score, 5.0)
  } else if (flagCount === 2) {
    result.overall_score = Math.min(result.overall_score, 5.5)
  } else if (flagCount === 1) {
    result.overall_score = Math.min(result.overall_score, 6.0)
  }

  // Cap overall if any critical criterion scored very low (< 5)
  // Elbow L-shape (5), one-hand release (11), shooting follow-through (15), guide follow-through (16)
  const criticalCriteriaIds = [5, 11, 15, 16]
  const hasVeryLowCriticalScore = result.criteria.some(
    c => criticalCriteriaIds.includes(c.id) && c.score !== null && (c.score as number) < 5
  )
  if (hasVeryLowCriticalScore) {
    result.overall_score = Math.min(result.overall_score, 6.0)
  }

  // Stacking cap: 2+ of the 2.5x-weighted criteria (elbow=5, one-hand release=11, follow-through=15) score ≤5
  const weightedLowCount = [5, 11, 15].filter(id => {
    const c = result.criteria.find(c => c.id === id)
    return c?.score !== null && (c?.score as number) <= 5
  }).length
  if (weightedLowCount >= 3) result.overall_score = Math.min(result.overall_score, 5.0)
  else if (weightedLowCount >= 2) result.overall_score = Math.min(result.overall_score, 5.5)

  // Apply player type adjustments
  const pt = result.player_assessment?.player_type ?? 'recreational'
  let multiplier = 1.0
  let minimumScore: number | null = null

  if (pt === 'child') {
    multiplier = 0.9
  } else if (pt === 'college_pro') {
    multiplier = 1.025
  } else if (pt === 'nba_decent') {
    multiplier = 1.025
    if (!flagsTriggered) minimumScore = 8.5
  } else if (pt === 'nba_elite') {
    multiplier = 1.025
    if (!flagsTriggered) minimumScore = 9.5
  }
  // nba_bad_form and recreational: no adjustment

  result.overall_score = Math.round(result.overall_score * multiplier * 10) / 10
  if (minimumScore !== null) {
    result.overall_score = Math.max(result.overall_score, minimumScore)
  }
  result.overall_score = Math.min(10, result.overall_score)

  // The overall score can never exceed the player's best individual criterion.
  // A headline number sitting above every sub-score reads as a bug to users —
  // this clamps it after every bonus, floor, and cap above has been applied.
  const scoredCriterionValues = result.criteria
    .filter((c) => c.score !== null)
    .map((c) => c.score as number)
  if (scoredCriterionValues.length > 0) {
    result.overall_score = Math.min(
      result.overall_score,
      Math.max(...scoredCriterionValues),
    )
  }

  return result
}

// ---------------------------------------------------------------------------
// Ensemble: run N independent grading passes at temperature 0 on the SAME
// frames and take per-criterion medians. A single drifty pass can no longer
// move a score — the same video grades the same way every time.
// ---------------------------------------------------------------------------

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function majority(bools: boolean[]): boolean {
  return bools.filter(Boolean).length * 2 > bools.length
}

export async function analyzeShot(
  frameBase64Array: string[],
  frameMimeTypes: string[],
  opts?: { model?: string; thinking?: 'disabled' | 'adaptive' }
): Promise<AnalysisResult> {
  const passes = Math.max(1, Math.min(5, parseInt(process.env.ANALYSIS_PASSES || '3', 10) || 3))

  // Sequential on purpose: pass 1 writes the prompt+image prefix into the
  // Anthropic cache, passes 2..N read it back at a fraction of the input cost.
  const runs: Array<{ result: AnalysisResult; activeCriteria: CriteriaRow[] }> = []
  for (let i = 0; i < passes; i++) {
    const run = await analyzeShotOnce(frameBase64Array, frameMimeTypes, opts)
    // A non-shot verdict is decisive only by majority — collect and continue.
    runs.push(run)
  }

  const activeCriteria = runs[0].activeCriteria
  const results = runs.map(r => r.result)

  // Shot detection: majority. A clip most passes call "no shot" is no shot.
  const shotDetected = majority(results.map(r => r.shot_detected !== false))
  if (!shotDetected) {
    const no = results.find(r => r.shot_detected === false) ?? results[0]
    no.shot_detected = false
    return no
  }
  const detected = results.filter(r => r.shot_detected !== false)

  // Per-criterion merge: median of scored passes; null only when most passes
  // said null. Reasoning comes from the pass closest to the median so the
  // player-facing text matches the number.
  const merged: AnalysisResult = {
    ...detected[0],
    shot_detected: true,
    critical_flags: {
      elbow_severely_out: majority(detected.map(r => r.critical_flags.elbow_severely_out)),
      followthrough_flick_to_side: majority(detected.map(r => r.critical_flags.followthrough_flick_to_side)),
      arc_too_flat: majority(detected.map(r => r.critical_flags.arc_too_flat ?? false)),
      chest_pass_hands: majority(detected.map(r => r.critical_flags.chest_pass_hands ?? false)),
    },
    criteria: activeCriteria.map(ac => {
      const perPass = detected
        .map(r => r.criteria.find(c => c.id === Number(ac.id)))
        .filter((c): c is CriterionResult => !!c)
      const scoredPasses = perPass.filter(c => c.score !== null)
      // Null wins when it's the majority view (visibility rules held).
      if (scoredPasses.length * 2 <= perPass.length || scoredPasses.length === 0) {
        const nullPass = perPass.find(c => c.score === null)
        return { id: Number(ac.id), score: null, reasoning: nullPass?.reasoning ?? '' }
      }
      const med = median(scoredPasses.map(c => c.score as number))
      const closest = scoredPasses.reduce((best, c) =>
        Math.abs((c.score as number) - med) < Math.abs((best.score as number) - med) ? c : best
      )
      // Round medians to one decimal so 2-pass averages don't invent .25s.
      return { id: Number(ac.id), score: Math.round(med * 10) / 10, reasoning: closest.reasoning }
    }),
  }

  // Player assessment: majority player_type (ties fall back to first pass).
  const typeCounts = new Map<string, number>()
  for (const r of detected) {
    const t = r.player_assessment?.player_type ?? 'recreational'
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1)
  }
  const majorityType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0] as PlayerType
  merged.player_assessment = {
    player_type: majorityType,
    player_name: detected.find(r => (r.player_assessment?.player_type ?? 'recreational') === majorityType)
      ?.player_assessment?.player_name ?? null,
  }

  return finalizeResult(merged, activeCriteria)
}
