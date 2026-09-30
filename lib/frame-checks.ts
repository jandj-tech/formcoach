/**
 * FRAME CHECKS — observation-first grading for the four criteria that carry
 * the big misses. FRAME_CHECKS=1 to enable; off by default.
 *
 * WHY. Every measurement in this project says the same two things. The
 * model answers a yes/no question about ONE frame from the pixels (Shot
 * Pocket misses 0%; the catapult probe is right on one frame). It answers
 * an absolute-scale or sequence question from a prior (placement at chance;
 * "elbows tucked, forearms vertical" written about a catapult it had just
 * located). And every big miss has one of two shapes: a fault it never
 * looked for, scored 9; or a good shot charged for something else, scored 4.
 *
 * So the four criteria are not asked for scores. Named frames get yes/no
 * questions, and CODE turns the answers into a cap or a floor. A cap stops
 * a catapult scoring 9. A floor stops a clean elbow scoring 4. The grading
 * pass still writes the number and the player-facing text, but inside a
 * range the pixels set. Miss SIZE is bounded from both sides.
 *
 * Frames are addressed by offset from the release frame the gate finds
 * (R): set point R-1..R-3, dip R-6, landing R+4. Offsets, not detection:
 * "which frame is the dip" is a sequence question, and those fail.
 */
import { callVisionModel } from '@/lib/model-provider'

export interface FrameChecks {
  release: number
  /** Set point (majority of R-1..R-3). */
  elbow: null | { catapult: boolean; flared: boolean; clean: boolean; frames: number[] }
  /** Dip frame R-6 vs release R. */
  power: null | { ball_low_at_dip: boolean; knees_bent_at_dip: boolean; head_higher_at_release: boolean }
  /** Release R (shoulders) and landing R+4 vs R. */
  square: null | { both_shoulders_visible: boolean; one_shoulder_hidden: boolean; lands_same_direction: boolean }
  /** Last both-feet-down (R-3) and landing R+4. */
  feet: null | { floor_between_shins: boolean; shoes_outside_shoulders: boolean }
  /** Release R and just after (R+2): the hands. */
  hands: null | { guide_hand_on_ball_at_release: boolean; both_hands_pushing: boolean; hands_converge_after: boolean; shooting_hand_off_line: boolean }
  /** Which criteria received a cap or floor, for the dump. */
  applied: string[]
}

type Ask = Record<string, boolean>
async function ask(model: string, frames: string[], mimes: string[], idx: number[], text: string, keys: string[]): Promise<Ask | null> {
  const use = idx.filter((i) => i >= 0 && i < frames.length)
  if (use.length !== idx.length) return null
  try {
    const res = await callVisionModel({
      model,
      framesBase64: use.map((i) => frames[i]),
      frameMimeTypes: use.map((i) => mimes[i]),
      userText: text,
      maxTokens: 8000,
    })
    const m = res.text.match(/\{[\s\S]*\}/)
    if (!m) return null
    const raw = JSON.parse(m[0]) as Record<string, unknown>
    if (!keys.every((k) => typeof raw[k] === 'boolean')) return null
    return Object.fromEntries(keys.map((k) => [k, raw[k] === true]))
  } catch {
    return null
  }
}

const ONE = 'This is ONE frame of a basketball shot. Answer literally about what is visible in THIS image; do not describe what a shot usually looks like.'

export async function runFrameChecks(frames: string[], mimes: string[], model: string, R: number): Promise<FrameChecks> {
  const fc: FrameChecks = { release: R, elbow: null, power: null, square: null, feet: null, hands: null, applied: [] }

  // --- ELBOW: three set-point frames, majority -------------------------------
  const spKeys = ['ball_behind_or_above_head', 'elbow_flared_shoulder_height', 'ball_beside_head', 'ball_in_front_of_forehead', 'elbow_inside_shoulder_line', 'one_hand_under_ball']
  const spQ = `${ONE} It is at or just before the set point, before the upward release.
1. Is the ball ABOVE or BEHIND the top of the head?
2. Is the shooting elbow flared OUT at or above shoulder height, upper arm near horizontal?
3. Is the ball level with the EAR and outside the line of the shoulder?
4. Is the ball IN FRONT of the head, above the forehead, on the shooting side?
5. Is the shooting elbow INSIDE the outer line of the shoulder, under the ball?
6. Is ONE hand under the ball with the other hand only on its side?
Answer JSON only: {"ball_behind_or_above_head":true|false,"elbow_flared_shoulder_height":true|false,"ball_beside_head":true|false,"ball_in_front_of_forehead":true|false,"elbow_inside_shoulder_line":true|false,"one_hand_under_ball":true|false}`
  const spFrames = [R - 1, R - 2, R - 3, R - 4].filter((i) => i >= 0)
  const spAns = (await Promise.all(spFrames.map((i) => ask(model, frames, mimes, [i], spQ, spKeys)))).filter((a): a is Ask => !!a)
  if (spAns.length > 0) {
    const need = Math.ceil(spAns.length / 2)
    const n = (f: (a: Ask) => boolean) => spAns.filter(f).length
    // ANY frame, not a majority. On identical frames the cue answers vary
    // run to run (e51: the catapult on shot-196 lit 1 of 3 runs; e50: 3 of
    // 3), and a fault SEEN is strong evidence - E35 measured a low reading's
    // specificity at ~98% and the E45 controls never lit both cues on any
    // frame. Recall over precision here, because the two cues together have
    // not produced a false positive yet.
    const catapult = n((a) => a.ball_behind_or_above_head && a.elbow_flared_shoulder_height) >= 1
    const flared = !catapult && n((a) => a.ball_beside_head && a.elbow_flared_shoulder_height) >= need
    const clean = !catapult && !flared && n((a) => a.ball_in_front_of_forehead && a.elbow_inside_shoulder_line && a.one_hand_under_ball && !a.elbow_flared_shoulder_height) >= need
    fc.elbow = { catapult, flared, clean, frames: spFrames }
  }

  // --- POWER: dip frame vs release ---------------------------------------------
  const dip = R - 6
  const dipKeys = ['ball_at_or_below_chin', 'knees_visibly_bent']
  const dipAns = await ask(model, frames, mimes, [dip], `${ONE} It is from the gather, before the shot goes up.
1. Is the ball at or BELOW the chin (not yet raised to the face)?
2. Are the knees visibly bent?
Answer JSON only: {"ball_at_or_below_chin":true|false,"knees_visibly_bent":true|false}`, dipKeys)
  const riseKeys = ['head_higher_in_second']
  const riseAns = await ask(model, frames, mimes, [dip, R], `These are TWO frames of one basketball shot: the first from the gather, the second at the release. Compare the position of the TOP OF THE SHOOTER'S HEAD in the picture.
Is the top of the head clearly HIGHER in the second image than in the first (the body rose)?
Answer JSON only: {"head_higher_in_second":true|false}`, riseKeys)
  if (dipAns && riseAns) {
    fc.power = { ball_low_at_dip: dipAns.ball_at_or_below_chin, knees_bent_at_dip: dipAns.knees_visibly_bent, head_higher_at_release: riseAns.head_higher_in_second }
  }

  // --- SQUARE: shoulders at release; landing vs release -------------------------
  const shKeys = ['both_shoulders_visible_similar_size', 'one_shoulder_hidden_or_side_on']
  const shAns = await ask(model, frames, mimes, [R], `${ONE} It is the release frame.
1. Are BOTH shoulders visible and of similar size, the far one not hidden behind the near one (the chest faces the camera)?
2. Is one shoulder hidden or the torso side-on to the camera?
Answer JSON only: {"both_shoulders_visible_similar_size":true|false,"one_shoulder_hidden_or_side_on":true|false}`, shKeys)
  const land = R + 4
  const landKeys = ['facing_same_direction']
  const landAns = await ask(model, frames, mimes, [R, land], `These are TWO frames of one basketball shot: the release, then the landing a moment later.
Is the shooter's chest facing the SAME direction in both (no twist in the air)?
Answer JSON only: {"facing_same_direction":true|false}`, landKeys)
  if (shAns) {
    fc.square = { both_shoulders_visible: shAns.both_shoulders_visible_similar_size, one_shoulder_hidden: shAns.one_shoulder_hidden_or_side_on, lands_same_direction: landAns ? landAns.facing_same_direction : true }
  }

  // --- FEET: last both-feet-down frame ----------------------------------------
  const ftKeys = ['floor_visible_between_shins', 'shoes_outside_shoulder_lines']
  const ftAns = await ask(model, frames, mimes, [R - 3], `${ONE} Both feet should be on the floor.
1. Is there visible floor between the shins (the feet are clearly apart, not touching)?
2. Are the shoes planted clearly OUTSIDE the vertical lines dropped from the shoulders (a wide straddle)?
Answer JSON only: {"floor_visible_between_shins":true|false,"shoes_outside_shoulder_lines":true|false}`, ftKeys)
  if (ftAns) fc.feet = { floor_between_shins: ftAns.floor_visible_between_shins, shoes_outside_shoulders: ftAns.shoes_outside_shoulder_lines }

  // --- HANDS: release frame and two frames after --------------------------------
  const relKeys = ['guide_hand_still_on_ball', 'both_hands_pushing_ball']
  const relAns = await ask(model, frames, mimes, [R], `${ONE} It is the release frame: the ball is leaving, or has just left, the hand.
1. Is the guide (non-shooting) hand STILL touching the ball as it leaves?
2. Are BOTH hands pushing the ball — palms behind or under it together, like a two-handed shove — rather than one hand releasing and the other only resting on the side?
Answer JSON only: {"guide_hand_still_on_ball":true|false,"both_hands_pushing_ball":true|false}`, relKeys)
  const aftKeys = ['hands_converged_or_crossed', 'shooting_hand_pointing_off_to_side']
  const aftAns = await ask(model, frames, mimes, [R + 2], `${ONE} It is just after the release, the ball already gone.
1. Have the two hands come TOGETHER — converged, touching or crossed in front of the face — rather than staying clearly apart?
2. Is the shooting hand's follow-through pointing off to one SIDE (wrist flicked sideways, palm rolled outward) rather than straight ahead toward the target?
Answer JSON only: {"hands_converged_or_crossed":true|false,"shooting_hand_pointing_off_to_side":true|false}`, aftKeys)
  if (relAns && aftAns) {
    fc.hands = { guide_hand_on_ball_at_release: relAns.guide_hand_still_on_ball, both_hands_pushing: relAns.both_hands_pushing_ball, hands_converge_after: aftAns.hands_converged_or_crossed, shooting_hand_off_line: aftAns.shooting_hand_pointing_off_to_side }
  }

  console.log('[framechecks]', JSON.stringify({ R, elbow: fc.elbow, power: fc.power, square: fc.square, feet: fc.feet, hands: fc.hands }))
  return fc
}

/** Caps and floors, computed from the cues. Returns the list applied. */
export function frameCheckBounds(fc: FrameChecks): Array<{ criterion: string; cap?: number; floor?: number; why: string }> {
  const b: Array<{ criterion: string; cap?: number; floor?: number; why: string }> = []
  const ELBOW = 'Elbow L-Shape — Under the Ball', POWER = 'Source of Shot Power', POCKET = 'Shot Pocket — Elbow'
  const SQUARE = 'Square to the Basket', FEET = 'Feet Shoulder Width Apart'
  if (fc.elbow) {
    if (fc.elbow.catapult) { b.push({ criterion: ELBOW, cap: 3, why: 'the ball went over or behind the head with the elbow flared' }); b.push({ criterion: POCKET, cap: 4, why: 'the ball was loaded over the head, not in a pocket' }); b.push({ criterion: POWER, cap: 4, why: 'the ball was slung from over the head' }) }
    else if (fc.elbow.flared) b.push({ criterion: ELBOW, cap: 4, why: 'the elbow was out at the shoulder with the ball beside the head' })
    else if (fc.elbow.clean) b.push({ criterion: ELBOW, floor: 6, why: 'the ball was in front of the forehead with the elbow inside the shoulder line and one hand under it' })
  }
  if (fc.power) {
    if (!fc.power.head_higher_at_release) b.push({ criterion: POWER, cap: 5, why: 'the body had not risen between the gather and the release' })
    else if (fc.power.ball_low_at_dip && fc.power.knees_bent_at_dip) b.push({ criterion: POWER, floor: 7, why: 'the ball was low in a bent-knee gather and the body rose into the release' })
  }
  // Square and Feet are CAP-ONLY. E50 arm: every remaining big miss was a
  // floor fired on a distant shooter where the cue lied - "both shoulders
  // visible" is true of a chest facing the camera while the ball leaves
  // sideways (shot-208, expert 3-5 -> 9), and "floor between the shins" read
  // true on feet the expert scored 1-5 (shot-156, 187). Caps only need the
  // fault to be seen; floors need the absence of a fault to be seen, and at
  // 80px these two cues cannot see that.
  if (fc.square) {
    if (fc.square.one_shoulder_hidden && !fc.square.both_shoulders_visible) b.push({ criterion: SQUARE, cap: 5, why: 'the torso was side-on at the release' })
  }
  if (fc.feet) {
    if (!fc.feet.floor_between_shins) b.push({ criterion: FEET, cap: 5, why: 'the feet were together with no floor between the shins' })
    else if (fc.feet.shoes_outside_shoulders) b.push({ criterion: FEET, cap: 5, why: 'the shoes were planted well outside the shoulders' })
  }
  const ONEHAND = 'Shooting Through Guide Hand / One Hand Release', GHFT = 'Guide Hand Follow Through', SHFT = 'Shooting Hand Follow Through'
  if (fc.hands) {
    // Caps only. Two cues must agree for the two-hand call; one for the flick.
    if (fc.hands.guide_hand_on_ball_at_release && fc.hands.both_hands_pushing) { b.push({ criterion: ONEHAND, cap: 4, why: 'the guide hand was still on the ball and both hands pushed it at the release' }); b.push({ criterion: GHFT, cap: 4, why: 'the guide hand pushed the ball rather than peeling off' }) }
    if (fc.hands.hands_converge_after) { b.push({ criterion: GHFT, cap: 4, why: 'the hands came together after the release' }); b.push({ criterion: ONEHAND, cap: 5, why: 'the hands converged as the ball left' }) }
    if (fc.hands.shooting_hand_off_line) b.push({ criterion: SHFT, cap: 5, why: 'the shooting hand finished off to the side rather than at the target' })
  }
  // A cap always beats a floor on the same criterion: a detected fault
  // outranks a detected virtue. (E50 run 1 on shot-196: the catapult cap put
  // Power at 4 and the rise floor then lifted it to 7.)
  const capped = new Set(b.filter((x) => x.cap !== undefined).map((x) => x.criterion))
  return b.filter((x) => x.floor === undefined || !capped.has(x.criterion))
}

/** Facts for the grading pass, scoped per criterion so nothing haloes. */
export function frameCheckFacts(fc: FrameChecks): string {
  const bounds = frameCheckBounds(fc)
  if (bounds.length === 0) return ''
  const lines = bounds.map((x) => `  ${x.criterion}: ${x.cap !== undefined ? `at most ${x.cap}` : `at least ${x.floor}`} — ${x.why}.`)
  return `FRAME CHECKS — specific frames of this shot were inspected on their own, as single images, with literal yes/no questions. From those answers, these criteria have a fixed range. Score inside it and write the reasoning to match; this applies ONLY to the criteria named here:\n${lines.join('\n')}`
}
