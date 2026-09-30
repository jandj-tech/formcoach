-- Promote the four research-based rubrics measured in E54 (2026-09-30) into the
-- live grading text. Production reads criteria.grading_notes; the draft files under
-- scripts/rubrics/ are eval-only. Idempotent: each UPDATE skips a row already on
-- this version. Measured with FRAME_CHECKS=1: miss 46.2% -> 33.3%, FIXED 25 /
-- BROKE 10, McNemar p = 0.0167; big misses 11 -> 4. See scripts/eval/EXPERIMENTS.md E54.
BEGIN;

UPDATE criteria
SET grading_notes = 'ELBOW RUBRIC v12 — where is the ball relative to the head, where is the elbow relative to the shoulder, and does the forearm stand or lean?

READ THE ARM AS A SILHOUETTE AT THE SET POINT — the highest frame where the ball is still held, before the arms extend. Everything here is a coarse shape question that stays readable when the shooter is small. You are never asked to measure an angle or a gap; you are asked which of a few pictures the frame matches.

THE THREE SHAPES:

1. THE BALL AGAINST THE HEAD.
   - IN FRONT: above the forehead, on the shooting side. Normal.
   - BESIDE: level with the ear and outside the line of the shoulder, off to the side of the head. The upper arm has swung out to put it there.
   - OVER OR BEHIND: on the crown or behind the head, both hands still on it. Check the frames before: a ball that travelled UP AND BACK to get there and paused before coming forward is the catapult. That path is visible before the set point, not at the release.

2. THE ELBOW AGAINST THE SHOULDER LINE. Two states only.
   - INSIDE: the elbow sits inside the outer line of the shoulder, under the ball region. The arm is carrying the ball from underneath.
   - AT OR BEYOND: the elbow is level with or outside the shoulder''s outer edge and the upper arm is near horizontal. The arm is winged.
   - Also note whether BOTH elbows are out wide with the ball in the middle — a W or a wide V — which is a two-arm load, not a one-arm shot.

3. THE FOREARM: A POST OR A LEAN.
   - POST: standing up under the ball, close to upright.
   - LEAN: tilted so the hand is inboard and the elbow outboard — a V rather than an L.
   - LAID BACK: folded back so the hand is behind the elbow. Catapult territory — check the ball again.

THE COACH''S OWN TELL, when the hand is readable: you should NOT see the little finger on the side of the ball. A visible pinky means the hand is on the side and the elbow is out. When the hand is not readable, the three shapes decide.

SCORE ANCHORS — every whole and half point from 1 to 10 is available; land between anchors when the shot sits between them. Do not round toward the milder anchor. Pick the picture that matches.
  10 — Ball IN FRONT. Elbow INSIDE. Forearm a POST. One hand finishes, the guide hand peels off the side. Nothing to name.
  9  — As 10 with one small thing you can name: a brief drift on the rise that is gone by the set point, or a forearm just off upright.
  8  — Ball IN FRONT, elbow INSIDE, forearm in a mild LEAN. The ordinary good shot.
  7  — Ball IN FRONT, elbow still INSIDE but the upper arm visibly angled out from the body, forearm in a LEAN. The pinky often shows here.
  6  — Ball IN FRONT, the elbow drifting out toward the shoulder line, a clear LEAN. Still a one-hand finish.
  5  — ONE of the two faults, not both: the ball BESIDE the head with the elbow still inside the shoulder line, OR the elbow AT the shoulder edge with the ball still in front. Forearm in a LEAN. One-hand finish.
  4  — Elbow AT OR BEYOND the shoulder edge AND the ball BESIDE the head. Winged out, ball at the ear. Write it as a flared elbow with the ball beside the head. One-hand finish.
  3  — Any of: the ball beside the head with the forearm LAID BACK; the sideways L (bent arm rotated so the forearm points sideways, not up); a two-arm V with the ball IN FRONT of the head and both hands throwing it (the expert scored exactly this a 3); or the two-hand chest shove — the ball never loads above the chin and both arms push it out together.
  1-2 — CATAPULT: the ball went OVER OR BEHIND the head, both hands on it, both elbows high and wide, up-and-back then slung forward.

WHAT SEPARATES 4 FROM 3 FROM 2. All have the elbow far out. A 4 keeps the ball in front of or beside the head and releases off ONE hand. A 3 is where two arms start doing the work, or the forearm has folded back, but the ball stayed in front. A 2 is the ball over or behind the head. The expert has corrected the confusion in both directions — "this was NOT a catapult, this was just the shooting hand being flared out" (he scored that elbow 4), and "it was a catapult shot, the ball was in a V at the top and out" (he scored that elbow 3). NEVER write catapult, heave, sling or hoist about a shot that released off one hand with the ball in front of the head. If a block headed SET-POINT CHECK appears anywhere in this request, its answers decide which side of these lines the shot is on.

DO NOT SOFTEN A SHAPE YOU SAW. "Reasonably tucked", "slight outward angle", "nothing severe", "within a workable range" have each been written about shots the expert scored 3. If the elbow was at the shoulder edge, the score is 5 or below, however good the follow-through looked afterward. A player is better served by a 4 that names the fault than by an 8 that calls it nothing.

DO NOT MARK DOWN A GOOD ARM FOR NOT BEING PERFECT. An elite shooter seen from the side — ball above the shooting shoulder, forearm standing under it, elbow pointing down — is a 9 to 9.5 even when the bend is a little shy of a right angle. Calling that a V, or docking it for not being exactly square, is the error in the other direction and the expert has corrected it too.

THE FOLD ANGLE IS NOT SCORED FROM THE FRONT. From a camera in front of the shooter the forearm is foreshortened and any bend you appear to see comes from how the player is turned. Judge the three shapes and take nothing off for the fold. From a side camera, an arm that has plainly given up its bend — upper arm and forearm in a near-straight line with the ball out beside the head — caps at 4 (the open push); a forearm folded back over the player caps at 3 and sends you to the catapult check. A straight arm AT FULL EXTENSION is the finish of a good shot, not an open push.

SCORE THE REP IN FRONT OF YOU. Do not average a clean rep down because nobody is perfect, and do not carry a good early frame over a rep where the arm plainly swung out.

RETURN NULL WHEN the shooting elbow is hidden in every frame between the rise and the set point, or every frame you have is at or after the release.

PLAYER-FACING WORDING: tell them to get the shooting hand under the ball with the elbow pointing at the floor, the ball up in front of the forehead on the shooting side, the other hand only along for the ride. Never mention angles, lines, shapes by letter, studies, frames or the camera in the reasoning.'
WHERE name = 'Elbow L-Shape — Under the Ball'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'ELBOW RUBRIC v12%');

UPDATE criteria
SET grading_notes = 'SQUARE RUBRIC v8 — are the SHOULDERS square to the TARGET at the release, and did the turn finish before the feet left the floor?

THIS IS THE COACH''S OWN DEFINITION: "I must get my shoulders square to the target." His named fault is the player who jumps and THEN turns, when they should turn and THEN jump. He does not score where the toes point — feet turned toward the off-hand side, the way most good shooters stand (Hopla via Klay Thompson), is normal and costs nothing here. Ignore any instruction elsewhere to compare the toes: that belongs to "Forward Motion and Toes". Do not compare the feet to the shoulders either: a body can be consistent with itself and aimed at the wrong place.

STEP 0 — FIND THE TARGET DIRECTION. Use these in order, and beware the rim behind the shooter.
  1. WHERE THE BALL LEAVES THE PICTURE after release: out of the TOP means the target is behind or above the camera; out of the LEFT or RIGHT means the target is on that side.
  2. A rim the ball is visibly travelling toward and arriving at.
  3. The extended shooting arm at release — it points down the shot line.
  A RIM VISIBLE BEHIND THE SHOOTER IS USUALLY THE FAR BASKET. Never take it as the target unless the ball is visibly travelling toward it. If none of the three is readable, set evidence to "none" and score from the shoulders alone against the camera.

STEP 1 — THREE FRAMES: the last frame with both feet on the floor, the release, the landing. Read the SHOULDER LINE — the two outer edges of the torso — in each. When the target is behind the camera, square means the chest faces the camera: both shoulders visible, the far one not hidden behind the near one, the torso at its widest.

SCORE ANCHORS — a coarse ladder on purpose; land between anchors when the shot sits between them.
  9-10 — At the release both shoulders are visible and the far one is not hidden; the shoulders were already there before the feet left the floor; lands facing the same way. The ordinary correct shot. Feet may be turned; that is fine.
  7-8  — Slightly open at the release — the far shoulder partly tucked behind the near one — but steady from take-off to landing; or square at release with a visible turn on landing.
  6    — The shoulders are still coming round AFTER the feet have left the floor and only reach square at the release: jump-then-turn. A turn completed before take-off costs nothing.
  5    — Open at the release and still turning as the ball leaves; shooting somewhat across the body.
  3-4  — One shoulder occluded — the torso side-on or nearly so — with the ball leaving toward the camera; or the body twists in the air and lands facing a different direction from the take-off.
  1-2  — Side or back to the target on a set shot; the shoulders never came round.

WHAT IS NOT A FAULT: feet turned to eleven o''clock; the shooting shoulder slightly forward (that is what a one-hand shot looks like); a fade or drift (balance criteria); the hips finishing their turn after the shoulders have locked; rotation that finishes before take-off.

IF THE RELEASE IS NOT IN THE CLIP, score the last frame you have with evidence "partial". Never null.

PLAYER-FACING WORDING: tell them to turn first and jump second — shoulders facing the rim before the feet leave the floor, land facing the same way. Never mention lines, letters, angles, frames, the camera, the far basket, the expert or the guide in the reasoning.'
WHERE name = 'Square to the Basket'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'SQUARE RUBRIC v8%');

UPDATE criteria
SET grading_notes = 'POWER RUBRIC v7 — did the ball ride up on the legs, or did the arms lift it?

THIS CRITERION SCORES ORDER, NOT DEPTH. How far the knees bend is a weak signal — strong and older shooters shoot from a shallow bend and are still leg-driven (Cabarkapa 2022: professionals show no depth difference by proficiency). What separates a leg-driven shot from an arm shot is WHEN things happen, and that is a comparison between frames, readable at any distance.

THE ARMS ARE NOT SCORED HERE. Elbow shape belongs to the elbow criterion. If a block headed SET-POINT CHECK appears above this guide and reports CATAPULT, 4 is the ceiling here. Otherwise the arms do not enter this score. The pause at the top belongs to "Connected Shot" and is not charged here.

FIND THREE FRAMES. Track the top of the head and the ball.
  D — the frame where the head is LOWEST in the gather. If the clip starts after the gather, take the first frame as D and set evidence to "partial".
  R — the release: the first frame the ball is no longer touching the shooting hand.
  P — the frame where the head is HIGHEST.

TWO QUESTIONS:
  1. AT D, WAS THE BALL STILL LOW — at or below the chin? If yes, the ball waited for the legs and rose with them. If the ball was already up at the face or forehead at D, the arms lifted it before the legs moved.
  2. WAS THE BODY STILL RISING AT THE RELEASE? R at or before P means yes. The head visibly LOWER at R than at P means the ball left on the way down.

SCORE ANCHORS — land between anchors when the shot sits between them.
  8-10 — Ball low at D, head visibly higher at R than at D, R at or before P. The ball rode up on the legs. This is the ordinary correct shot; 10 when the head drop into the gather is plain, 8 when it is slight.
  7    — Legs and arm both work but the release comes after the peak on a shot from distance: the head is visibly lower at R than at P.
  6    — Ball already at the face at D, then the legs extend and the body rises: the arms led and the legs caught up.
  5    — Ball at the face at D and the head barely rises between D and R: the body helped a little.
  4    — The head never rises between D and R: the arms did all of it. Also the ceiling under a CATAPULT verdict.
  2-3  — Two-hand chest shove: the ball never loads above the chin and both arms push it out together, hands mirrored on its sides.
  1    — No lower-body movement at any point and a two-hand shove.

ONE NAMED DEDUCTION: if the guide hand is still on the ball in the release frame and visibly pushing or steering it, take 1 off. The coach''s own case for this scored 6: the guide hand was doing work that should come from the legs.

WHAT IS NOT A FAULT: a shallow dip in a strong shooter; a set shot with the heels down as long as the head rises through the shot; releasing at the top of the jump on a close shot; a ball held high in front of the forehead with ONE elbow under it and the body still rising — a high set point, scored 8-10 here; landing ahead of the take-off spot; the guide hand on the ball at the set point; both arms finishing high.

Never write catapult, heave or sling unless a SET-POINT CHECK block above reports CATAPULT. A flared elbow costs nothing here.

IF THE HEAD IS HIDDEN OR THE CLIP ENDS BEFORE THE RELEASE, score what you can see with evidence "partial". Never null.

PLAYER-FACING WORDING: tell them to let the ball ride up on the legs — keep it low until the legs start, and let it go while the body is still rising. Never mention frames, letters, angles, studies, the check, flags, the expert or scoring bands in the reasoning.'
WHERE name = 'Source of Shot Power'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'POWER RUBRIC v7%');

UPDATE criteria
SET grading_notes = 'CONNECTED SHOT RUBRIC v2 — does the motion flow from the legs to the fingertips, or does it stop and restart?

THIS SCORES THE PAUSE AND THE RESTART, AND NOTHING ELSE. Order of legs and arms belongs to "Source of Shot Power"; elbow shape to the elbow criterion; the base to the stance criteria. Charging a fault twice is how a good shot with one flaw ends up scored as a bad shot.

FIND TWO FRAMES: R, the release — the first frame the ball is no longer touching the shooting hand — and the frame where the ball reaches its highest HELD position before R. Then watch the BALL from the gather to R: does it keep moving every frame, or does it sit still?

A ONE-FRAME STALL IS NOT A HITCH. At this frame spacing a continuous shot can look still for a single frame. Call a hitch only when the ball is in the same place for two or more consecutive frames while the head keeps moving.

SCORE ANCHORS — land between anchors when the shot sits between them.
  8-10 — The ball never sits still on the way up; one piece from gather to release. The ordinary correct shot, including a defined set point launched from at once. 10 when it flows without any visible check, 8 with a single-frame check.
  7    — A small hitch — the ball still for about two frames — but the shot continues straight out of it.
  6    — A clear pause at the top with the body already stopped; the arm finishes on its own.
  5    — A pause and a visible re-gather: the ball dips or resets before coming forward.
  4    — Two separate knee bends, or two separate pushes at the ball.
  3    — More than one hitch.
  1-2  — The shot stops dead at the top and is thrown from a standstill.

WHAT IS NOT A FAULT: a high set point launched from without a pause; a shallow dip; a set shot; a fade or drift; a guide hand on the ball at the set point; a ball that rises above the forehead (that is the elbow criterion''s question, not this one).

IF THE CLIP STARTS AFTER THE GATHER OR ENDS BEFORE THE RELEASE, score what you can see with evidence "partial". Never null.

PLAYER-FACING WORDING: tell them to make it one motion — no stop at the top, the ball leaves straight out of the rise. Never mention frames, letters, angles, the check, the expert or scoring bands in the reasoning.'
WHERE name = 'Connected Shot'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'CONNECTED SHOT RUBRIC v2%');

COMMIT;
