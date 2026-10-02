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
  elbow: null | { catapult: boolean; flared: boolean; clean: boolean; frames: number[]; v_top?: boolean; v_throw?: boolean; elbow_out?: boolean; counts?: Record<string, number>; answers?: number }
  /** Dip frame R-6 vs release R. */
  power: null | { ball_low_at_dip: boolean; knees_bent_at_dip: boolean; head_higher_at_release: boolean }
  /** Release R (shoulders) and landing R+4 vs R. */
  square: null | { both_shoulders_visible: boolean; one_shoulder_hidden: boolean; lands_same_direction: boolean; ball_sideways?: boolean; ball_up?: boolean }
  /** Last both-feet-down (R-3) and landing R+4. */
  feet: null | { floor_between_shins: boolean; shoes_outside_shoulders: boolean }
  /** Release R and just after (R+2): the hands. */
  hands: null | { guide_hand_on_ball_at_release: boolean; both_hands_pushing: boolean; hands_converge_after: boolean; shooting_hand_off_line: boolean }
  /** The shooter box the checks were cropped to (fractions of the frame), or null when uncropped. */
  crop?: { x0: number; y0: number; x1: number; y1: number } | null
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
    if (!m) { console.log(`[framechecks] no JSON for frames ${idx.join(',')}: ${res.text.slice(0, 80)}`); return null }
    const raw = JSON.parse(m[0]) as Record<string, unknown>
    if (!keys.every((k) => typeof raw[k] === 'boolean')) { console.log(`[framechecks] missing keys for frames ${idx.join(',')}: ${m[0].slice(0, 120)}`); return null }
    return Object.fromEntries(keys.map((k) => [k, raw[k] === true]))
  } catch (err) {
    console.log(`[framechecks] ask failed for frames ${idx.join(',')}: ${(err as Error).message.slice(0, 160)}`)
    return null
  }
}

type Box = { x0: number; y0: number; x1: number; y1: number }

const LOCATE = `These frames are consecutive moments from one basketball shot, in order.

Find the SHOOTER — the single player who takes the shot. Report the smallest
rectangle that contains that player's whole body, from the highest point the
ball or hands reach down to their feet, across EVERY frame shown. The box must
cover where they are in all of these frames, not just one.

Answer with JSON only, using fractions of the image from 0 to 1:
{"x0": <left>, "y0": <top>, "x1": <right>, "y1": <bottom>, "confident": <true|false>}

x0 is the left edge as a fraction of width, y0 the top as a fraction of height.
Set "confident" false if you cannot tell which player shoots, if the camera moves
so much that no single box covers them, or if you cannot see a shooter at all.
Be generous rather than tight — cutting off a hand or a foot is much worse than
including extra background.`

/**
 * CROP TO THE SHOOTER before asking. On the fixtures the shooter is about a
 * fifth of the frame height: the ball is ~21px, the hand ~15px, one 14px
 * patch. e55 measured the cost of that: shot-196 and shot-200 are the SAME
 * clip (identical frame hash), a plain catapult at 2x zoom, and the catapult
 * cue lit on 1 of 4 runs of identical frames. A yes/no answer about a shape
 * the token grid cannot express is a coin flip, and no majority rule fixes a
 * coin flip. The box comes from the model (scripts/eval/crop-boxes.mjs proved
 * this detector on 24 of 28 fixtures) and is VALIDATED; any failure grades
 * the checks uncropped, as before. E25 showed the crop biases the GRADING
 * pass low, so only the yes/no checks see the crop, never the grading passes.
 * FRAME_CHECK_CROP=0 turns it off.
 */
async function locateShooter(model: string, frames: string[], mimes: string[], R: number): Promise<Box | null> {
  const picks = [R - 8, R - 4, R, R + 3].filter((i) => i >= 0 && i < frames.length)
  if (picks.length < 2) return null
  try {
    const res = await callVisionModel({
      model,
      framesBase64: picks.map((i) => frames[i]),
      frameMimeTypes: picks.map((i) => mimes[i]),
      userText: LOCATE,
      maxTokens: 4000,
    })
    const m = res.text.match(/\{[\s\S]*\}/)
    if (!m) { console.log(`[framechecks] locate: no JSON: ${res.text.slice(0, 80)}`); return null }
    const b = JSON.parse(m[0]) as Record<string, unknown>
    const x0 = Number(b.x0), y0 = Number(b.y0), x1 = Number(b.x1), y1 = Number(b.y1)
    const w = x1 - x0, h = y1 - y0
    // Same validation as crop-boxes.mjs: a wrong crop is worse than a wide frame.
    if (b.confident === false || !(w > 0 && h > 0) || w * h > 0.8 || w * h < 0.01 || h < 0.15 || x0 < 0 || y0 < 0 || x1 > 1 || y1 > 1) {
      console.log(`[framechecks] locate: box rejected ${m[0].replace(/\s+/g, ' ').slice(0, 120)}`)
      return null
    }
    return { x0, y0, x1, y1 }
  } catch (err) {
    console.log(`[framechecks] locate failed: ${(err as Error).message.slice(0, 160)}`)
    return null
  }
}

const CROP_MARGIN_X = 0.08, CROP_MARGIN_Y = 0.12
async function cropFrame(b64: string, box: Box): Promise<string> {
  try {
    const { default: sharp } = await import('sharp')
    const img = sharp(Buffer.from(b64, 'base64'))
    const { width, height } = await img.metadata()
    if (!width || !height) return b64
    const x0 = Math.max(0, box.x0 - CROP_MARGIN_X), y0 = Math.max(0, box.y0 - CROP_MARGIN_Y)
    const x1 = Math.min(1, box.x1 + CROP_MARGIN_X), y1 = Math.min(1, box.y1 + CROP_MARGIN_Y)
    const left = Math.round(x0 * width), top = Math.round(y0 * height)
    const w = Math.min(Math.max(16, Math.round((x1 - x0) * width)), width - left)
    const h = Math.min(Math.max(16, Math.round((y1 - y0) * height)), height - top)
    // Restore size but KEEP the aspect ratio: the questions are about shapes
    // (an upper arm near horizontal, a forearm standing up) and a stretched
    // crop would change them.
    const scale = Math.min(width / w, height / h)
    const out = await img
      .extract({ left, top, width: w, height: h })
      .resize(Math.round(w * scale), Math.round(h * scale), { kernel: 'lanczos3' })
      .jpeg({ quality: 92 })
      .toBuffer()
    return out.toString('base64')
  } catch {
    return b64
  }
}

const ONE = 'This is ONE frame of a basketball shot. Answer literally about what is visible in THIS image; do not describe what a shot usually looks like.'

export async function runFrameChecks(frames: string[], mimes: string[], model: string, R: number): Promise<FrameChecks> {
  const fc: FrameChecks = { release: R, elbow: null, power: null, square: null, feet: null, hands: null, crop: null, applied: [] }

  // Every index the checks below address. Cropped copies replace them in
  // `view`; the grading passes never see `view`.
  const view = frames.slice(), vmimes = mimes.slice()
  if (process.env.FRAME_CHECK_CROP !== '0') {
    const box = await locateShooter(model, frames, mimes, R)
    if (box) {
      fc.crop = box
      const need = [...new Set([R - 1, R - 2, R - 3, R - 4, R - 6, R, R + 2, R + 3, R + 4].filter((i) => i >= 0 && i < frames.length))]
      await Promise.all(need.map(async (i) => { view[i] = await cropFrame(frames[i], box); vmimes[i] = 'image/jpeg' }))
    }
  }
  frames = view; mimes = vmimes

  // --- ELBOW: three set-point frames, majority -------------------------------
  const spKeys = ['ball_behind_or_above_head', 'elbow_flared_shoulder_height', 'ball_beside_head', 'ball_in_front_of_forehead', 'elbow_inside_shoulder_line', 'one_hand_under_ball', 'both_hands_mirrored_elbows_out', 'elbow_at_or_above_shoulder']
  const spQ = `${ONE} It is at or just before the set point, before the upward release.
1. Is the ball ABOVE or BEHIND the top of the head?
2. Is the shooting elbow flared OUT at or above shoulder height, upper arm near horizontal?
3. Is the ball level with the EAR and outside the line of the shoulder?
4. Is the ball IN FRONT of the head, above the forehead, on the shooting side?
5. Is the shooting elbow INSIDE the outer line of the shoulder, under the ball?
6. Is ONE hand under the ball with the other hand only on its side?
7. Are BOTH hands on the SIDES of the ball, mirrored like a chest pass, with BOTH elbows pointing out wide?
8. Is the shooting elbow LEVEL WITH or HIGHER than the shoulder, the upper arm horizontal or pointing upward (not angled down toward the ribs)?
Answer JSON only: {"ball_behind_or_above_head":true|false,"elbow_flared_shoulder_height":true|false,"ball_beside_head":true|false,"ball_in_front_of_forehead":true|false,"elbow_inside_shoulder_line":true|false,"one_hand_under_ball":true|false,"both_hands_mirrored_elbows_out":true|false,"elbow_at_or_above_shoulder":true|false}`
  const spFrames = [R - 1, R - 2, R - 3, R - 4].filter((i) => i >= 0)
  // Each frame is asked TWICE. On identical frames the answers vary between
  // calls (e51/e54: the catapult on shot-200 lit on some runs and not others),
  // and a single analysis in production gets one chance. Eight tiny
  // single-image calls instead of four; the majority is over all answers.
  const spAns = (await Promise.all([...spFrames, ...spFrames].map((i) => ask(model, frames, mimes, [i], spQ, spKeys)))).filter((a): a is Ask => !!a)
  if (spAns.length > 0) {
    const need = Math.ceil(spAns.length / 2)
    const n = (f: (a: Ask) => boolean) => spAns.filter(f).length
    // ANY frame, not a majority. On identical frames the cue answers vary
    // run to run (e51: the catapult on shot-196 lit 1 of 3 runs; e50: 3 of
    // 3), and a fault SEEN is strong evidence - E35 measured a low reading's
    // specificity at ~98% and the E45 controls never lit both cues on any
    // frame. Recall over precision here, because the two cues together have
    // not produced a false positive yet.
    // MAJORITY of the inspected frames, over four candidates. Any-frame (e53)
    // fired on 8 fixtures for 2 real catapults, with a confirmed false
    // positive on shot-206 (expert [6.5,8.5]); the majority rule (e50) fired
    // on exactly the two real ones. Precision wins: a false catapult caps
    // three criteria on a good shot, which is the miss this project exists
    // to remove.
    const catapult = n((a) => a.ball_behind_or_above_head && a.elbow_flared_shoulder_height) >= Math.max(2, need)
    // The two-arm V at the top (shot-202): both hands mirrored on the sides
    // of the ball with both elbows out, ball IN FRONT of the head, thrown off
    // both hands. The expert scored this shape a 3. The old rule also
    // demanded the elbows at shoulder height, which a V does not need - the
    // elbows are wide but low - so it never fired. Majority on the one cue.
    // Guarded by the one-hand cue on the SAME answer: the cropped probe
    // (2026-09-30) fired the bare mirrored cue once in three on shot-206, a
    // normal one-hand shot with the guide hand on the side.
    const vTopSet = !catapult && n((a) => a.both_hands_mirrored_elbows_out && !a.one_hand_under_ball) >= need
    // The V is a two-hand THROW. The set-point cue alone fired on one-hand
    // shots whose guide hand was still on the ball (198, 125); what separates
    // shot-202 is the release: both arms extend together and the ball leaves
    // off both hands. Two frames, asked twice; both answers must agree.
    const thKeys = ['both_arms_extend_together']
    const thQ = `These are TWO frames of one basketball shot: the release, then a moment after. Look at the ARMS.
Do BOTH arms extend straight up together, symmetrical, with BOTH hands having pushed the ball like a two-handed throw-in — rather than ONE shooting arm extending while the other hand stays beside the ball or drops away?
Answer JSON only: {"both_arms_extend_together":true|false}`
    const thAns = (await Promise.all([0, 1].map(() => ask(model, frames, mimes, [R, R + 2], thQ, thKeys)))).filter((a): a is Ask => !!a)
    const vThrow = thAns.length === 2 && thAns.every((a) => a.both_arms_extend_together)
    const vTop = vTopSet && vThrow
    const flared = !catapult && !vTop && n((a) => a.ball_beside_head && a.elbow_flared_shoulder_height) >= need
    // The elbow out at shoulder height with the ball still IN FRONT (shot-198
    // at 2x: ball above the forehead on the shooting side, upper arm near
    // horizontal). The rubric's own anchor for exactly this is 5. Without it
    // the clean floor fired on 198 (expert [3,5]) and lifted it to 6.
    // shot-198 at 2x: ball above the forehead on the shooting side, upper arm
    // horizontal. The flared cue read 0/8 there even cropped; this one asks
    // the height alone. Rubric anchor for this shape is 5.
    const elbowOut = !catapult && !vTop && !flared && n((a) => a.elbow_at_or_above_shoulder) >= need
    const clean = !catapult && !flared && !elbowOut && n((a) => a.ball_in_front_of_forehead && a.elbow_inside_shoulder_line && a.one_hand_under_ball && !a.elbow_flared_shoulder_height) >= need
    const counts = Object.fromEntries(spKeys.map((k) => [k, n((a) => a[k])]))
    fc.elbow = { catapult, flared, clean: clean && !vTop && !elbowOut, frames: spFrames, v_top: vTop, v_throw: vThrow, elbow_out: elbowOut, counts, answers: spAns.length }
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
  // Where the ball goes tells where the target is (Square v8's first rule).
  // E50: "both shoulders visible" is true of a chest facing the camera while
  // the ball leaves SIDEWAYS (shot-208, expert 3-5 -> 9). Two frames, asked
  // twice; sideways needs both answers.
  const dirKeys = ['ball_moves_toward_left_or_right_edge', 'ball_rises_over_shooter']
  const dirQ = `These are TWO frames of one basketball shot: the release, then a moment later with the ball in flight. Look only at where the BALL went.
1. Did the ball move clearly toward the LEFT or RIGHT edge of the picture (the target is off to one side)?
2. Did the ball rise UP over the shooter, staying roughly above them (the target is ahead of the camera or the shooter)?
Answer JSON only: {"ball_moves_toward_left_or_right_edge":true|false,"ball_rises_over_shooter":true|false}`
  const dirAns = (await Promise.all([0, 1].map(() => ask(model, frames, mimes, [R, R + 3], dirQ, dirKeys)))).filter((a): a is Ask => !!a)
  const ballSideways = dirAns.length === 2 && dirAns.every((a) => a.ball_moves_toward_left_or_right_edge && !a.ball_rises_over_shooter)
  const ballUp = dirAns.length === 2 && dirAns.every((a) => a.ball_rises_over_shooter && !a.ball_moves_toward_left_or_right_edge)
  if (shAns) {
    fc.square = { both_shoulders_visible: shAns.both_shoulders_visible_similar_size, one_shoulder_hidden: shAns.one_shoulder_hidden_or_side_on, lands_same_direction: landAns ? landAns.facing_same_direction : true, ball_sideways: ballSideways, ball_up: ballUp }
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

  console.log('[framechecks]', JSON.stringify({ R, crop: fc.crop, elbow: fc.elbow, power: fc.power, square: fc.square, feet: fc.feet, hands: fc.hands }))
  return fc
}

/** Caps and floors, computed from the cues. Returns the list applied. */
export function frameCheckBounds(fc: FrameChecks): Array<{ criterion: string; cap?: number; floor?: number; why: string }> {
  const b: Array<{ criterion: string; cap?: number; floor?: number; why: string }> = []
  const ELBOW = 'Elbow L-Shape — Under the Ball', POWER = 'Source of Shot Power', POCKET = 'Shot Pocket — Elbow'
  const SQUARE = 'Square to the Basket', FEET = 'Feet Shoulder Width Apart'
  const ONEHAND = 'Shooting Through Guide Hand / One Hand Release', GHFT = 'Guide Hand Follow Through', SHFT = 'Shooting Hand Follow Through'
  if (fc.elbow) {
    // No Shot Pocket cap on the catapult. CORRECTION (2026-10-01): the Pocket
    // bands on the catapult clip (shot-196/200, 7.5-9.5 and 7-9) are
    // AI-SEEDED, not the expert's - the expert's corrections for that clip do
    // not cover the pocket. So neither the cap (E50) nor its removal (e57) has
    // expert evidence; the removal stands because a cap without evidence is
    // the riskier guess, and the cell does not count toward the expert miss
    // rate either way.
    if (fc.elbow.catapult) { b.push({ criterion: ELBOW, cap: 3, why: 'the ball went over or behind the head with the elbow flared' }); b.push({ criterion: POWER, cap: 4, why: 'the ball was slung from over the head' }) }
    // shot-202 (the expert's own two-hand V): Elbow [3,5], Pocket [3,5], Power [5,7], One-Hand [3,5].
    // V-AT-TOP: RECORDED, NOT ACTED ON. Cropped probe 2026-09-30 (3 reps each):
    // fired 3/3 on shot-202 (the real V) but 2/3 on shot-198 and 1/3 on
    // shot-125, both one-hand finishes the expert scored 3-5 and 6.5-8. The
    // mirrored-hands cue at the set point reads 4/8 on a one-hand shot whose
    // guide hand is still on the ball, and 5-6/8 on the V: too thin to cap
    // three criteria on. Needs a release-side cue (both arms extending
    // together) before it can act. The counts stay in the dump.
    else if (fc.elbow.v_top) { b.push({ criterion: ELBOW, cap: 4, why: 'both hands were on the sides of the ball with both elbows out, and the ball was thrown from that two-handed V' }); b.push({ criterion: POCKET, cap: 4, why: 'the ball was held in a two-handed V rather than loaded in a one-hand pocket' }); b.push({ criterion: POWER, cap: 6, why: 'the ball was pushed out of a two-handed V by the arms' }); b.push({ criterion: ONEHAND, cap: 5, why: 'the ball left off both hands rather than through the guide hand' }) }
    else if (fc.elbow.flared) b.push({ criterion: ELBOW, cap: 4, why: 'the elbow was out at the shoulder with the ball beside the head' })
    // ELBOW-OUT: RECORDED, NOT ACTED ON. e58 early read (2026-10-01): the
    // elbow-height cue fired on shot-125 (expert Elbow [6.5,8]) on 2 of 3 runs
    // and cut a 9 to 5, and on shot-156 3/3. A high set point reads as "elbow
    // at the shoulder" from the front. It never caught shot-198 anyway (2/8).
    else if (fc.elbow.elbow_out && process.env.FRAME_CHECK_ELBOW_OUT === '1') b.push({ criterion: ELBOW, cap: 5, why: 'the elbow was out at shoulder height, outside the line of the shoulder, even though the ball stayed in front' })
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
    // Chest to the camera while the ball leaves toward a side edge: the
    // target was off to the side and the shoulders were not turned to it.
    // BALL-SIDEWAYS CAP: RECORDED, NOT ACTED ON. e58 early read: it fired on
    // shot-125 (expert Square [8.5,10]: 10 -> 5) and shot-180 ([8,10]: 9 -> 5).
    // "Toward a side edge" is true of a normal arc filmed from an angle. It
    // was right on shot-198 (probe 2/2), but a cap that is wrong on two good
    // shots for one bad one is the miss this project exists to remove.
    else if (fc.square.both_shoulders_visible && fc.square.ball_sideways && process.env.FRAME_CHECK_SQUARE_SIDEWAYS === '1') b.push({ criterion: SQUARE, cap: 5, why: 'the ball left toward the side of the picture while the chest stayed facing the camera, so the shoulders were not turned to the target' })
    // The floor E50 removed, now guarded by the ball's path: it only fires
    // when the ball rose over the shooter toward a target ahead.
    else if (fc.square.both_shoulders_visible && fc.square.ball_up && fc.square.lands_same_direction) b.push({ criterion: SQUARE, floor: 6, why: 'the chest faced the target, the ball rose straight over the shooter toward it, and the landing faced the same way' })
  }
  // Feet: RECORDED, NOT ACTED ON. e53 measured the Feet caps at 4 -> 8
  // misses against baseline; at ~80px the shin-gap and shoulder-line cues
  // are not reliable enough to cap on. The answers stay in the dump.
  // Hands: RECORDED, NOT ACTED ON. e53: Guide Hand caps fired on 11 of 27
  // fixtures for 5 -> 6 misses, One-Hand 5 -> 5. Neutral at best, and a
  // false cap on a clean release is exactly the miss we are removing. The
  // cues stay in the dump for the next design pass.
  void GHFT; void SHFT; void FEET
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
