-- E58 rubrics (2026-10-01): Elbow v13 and Power v9 - the dead references to a
-- SET-POINT CHECK block (no longer shown to the model) replaced by the picture.
-- No BEGIN/COMMIT: migrate.ts runs each file through db.unsafe. Idempotent.

UPDATE criteria
SET grading_notes = 'ELBOW RUBRIC v13 — where is the ball relative to the head, where is the elbow relative to the shoulder, and does the forearm stand or lean?

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

WHAT SEPARATES 4 FROM 3 FROM 2. All have the elbow far out. A 4 keeps the ball in front of or beside the head and releases off ONE hand. A 3 is where two arms start doing the work, or the forearm has folded back, but the ball stayed in front. A 2 is the ball over or behind the head. The expert has corrected the confusion in both directions — "this was NOT a catapult, this was just the shooting hand being flared out" (he scored that elbow 4), and "it was a catapult shot, the ball was in a V at the top and out" (he scored that elbow 3). NEVER write catapult, heave, sling or hoist about a shot that released off one hand with the ball in front of the head. The frames before the set point decide which side of these lines the shot is on: look for the ball travelling up and back over the head.

DO NOT SOFTEN A SHAPE YOU SAW. "Reasonably tucked", "slight outward angle", "nothing severe", "within a workable range" have each been written about shots the expert scored 3. If the elbow was at the shoulder edge, the score is 5 or below, however good the follow-through looked afterward. A player is better served by a 4 that names the fault than by an 8 that calls it nothing.

DO NOT MARK DOWN A GOOD ARM FOR NOT BEING PERFECT. An elite shooter seen from the side — ball above the shooting shoulder, forearm standing under it, elbow pointing down — is a 9 to 9.5 even when the bend is a little shy of a right angle. Calling that a V, or docking it for not being exactly square, is the error in the other direction and the expert has corrected it too.

THE FOLD ANGLE IS NOT SCORED FROM THE FRONT. From a camera in front of the shooter the forearm is foreshortened and any bend you appear to see comes from how the player is turned. Judge the three shapes and take nothing off for the fold. From a side camera, an arm that has plainly given up its bend — upper arm and forearm in a near-straight line with the ball out beside the head — caps at 4 (the open push); a forearm folded back over the player caps at 3 and sends you to the catapult check. A straight arm AT FULL EXTENSION is the finish of a good shot, not an open push.

SCORE THE REP IN FRONT OF YOU. Do not average a clean rep down because nobody is perfect, and do not carry a good early frame over a rep where the arm plainly swung out.

RETURN NULL WHEN the shooting elbow is hidden in every frame between the rise and the set point, or every frame you have is at or after the release.

PLAYER-FACING WORDING: tell them to get the shooting hand under the ball with the elbow pointing at the floor, the ball up in front of the forehead on the shooting side, the other hand only along for the ride. Never mention angles, lines, shapes by letter, studies, frames or the camera in the reasoning.
'
WHERE name = 'Elbow L-Shape — Under the Ball'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'ELBOW RUBRIC v13%');

UPDATE criteria
SET grading_notes = 'POWER RUBRIC v9 — did the ball ride up on the legs, or did the arms lift it?

THIS CRITERION SCORES ORDER, NOT DEPTH. How far the knees bend is a weak signal — strong and older shooters shoot from a shallow bend and are still leg-driven (Cabarkapa 2022: professionals show no depth difference by proficiency). What separates a leg-driven shot from an arm shot is WHEN things happen, and that is a comparison between frames, readable at any distance.

THE ARMS ARE NOT SCORED HERE. Elbow shape belongs to the elbow criterion. A ball slung from over or behind the head (the catapult) is found by a separate inspection of the frames and caps this criterion at 4 when it is found; you do not look for it here, and the arms do not enter this score. The pause at the top belongs to "Connected Shot" and is not charged here.

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
  4    — The head never rises between D and R: the arms did all of it. Also the ceiling when the catapult was found.
  2-3  — Two-hand chest shove: the ball never loads above the chin and both arms push it out together, hands mirrored on its sides.
  1    — No lower-body movement at any point and a two-hand shove.

THE PARK COUNTS HERE TOO. If the ball sits still at the top — same place in the picture — for THREE or more frames while the body finishes rising, the legs delivered and then the arm pushed on its own. The coach scores that against power: at most 6, whatever the dip and the rise looked like. (shot-193: the ball parked at the set point for about six frames; the coach scored power 3-6, the grader 9.)

ONE NAMED DEDUCTION: if the guide hand is still on the ball in the release frame and visibly pushing or steering it, take 1 off. The coach''s own case for this scored 6: the guide hand was doing work that should come from the legs.

WHAT IS NOT A FAULT: a shallow dip in a strong shooter; a set shot with the heels down as long as the head rises through the shot; releasing at the top of the jump on a close shot; a ball held high in front of the forehead with ONE elbow under it and the body still rising — a high set point, scored 8-10 here; landing ahead of the take-off spot; the guide hand on the ball at the set point; both arms finishing high.

Never write catapult, heave or sling in this criterion''s reasoning. A flared elbow costs nothing here.

IF THE HEAD IS HIDDEN OR THE CLIP ENDS BEFORE THE RELEASE, score what you can see with evidence "partial". Never null.

PLAYER-FACING WORDING: tell them to let the ball ride up on the legs — keep it low until the legs start, and let it go while the body is still rising. Never mention frames, letters, angles, studies, the check, flags, the expert or scoring bands in the reasoning.
'
WHERE name = 'Source of Shot Power'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'POWER RUBRIC v9%');
