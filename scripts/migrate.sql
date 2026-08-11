-- LearnHoops.com database schema

CREATE TABLE IF NOT EXISTS criteria (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  weight DECIMAL(3,2) DEFAULT 1.0,
  order_index INTEGER,
  active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS email_list (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  unsubscribed_at TIMESTAMP,
  marketing_emails_sent INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255),
  token VARCHAR(64) UNIQUE,
  status VARCHAR(20) DEFAULT 'processing',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analyses (
  id SERIAL PRIMARY KEY,
  submission_id UUID REFERENCES submissions(id),
  overall_score DECIMAL(4,1),
  frame_urls TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS criterion_scores (
  id SERIAL PRIMARY KEY,
  analysis_id INTEGER REFERENCES analyses(id),
  criterion_id INTEGER REFERENCES criteria(id),
  ai_score DECIMAL(4,1),
  ai_reasoning TEXT,
  admin_score DECIMAL(4,1),
  admin_notes TEXT
);

CREATE TABLE IF NOT EXISTS email_logs (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255),
  email_type VARCHAR(50),
  sent_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255),
  phone VARCHAR(50),
  variant VARCHAR(20) NOT NULL CHECK (variant IN ('left','right')),
  size VARCHAR(2) NOT NULL CHECK (size IN ('5','6','7')),
  amount_total INTEGER NOT NULL,
  currency VARCHAR(10) DEFAULT 'usd',
  shipping_name VARCHAR(255),
  shipping_line1 VARCHAR(255),
  shipping_line2 VARCHAR(255),
  shipping_city VARCHAR(100),
  shipping_state VARCHAR(100),
  shipping_postal_code VARCHAR(20),
  shipping_country VARCHAR(2),
  status VARCHAR(20) DEFAULT 'paid',
  created_at TIMESTAMP DEFAULT NOW()
);

-- If orders table existed before size column was added
ALTER TABLE orders ADD COLUMN IF NOT EXISTS size VARCHAR(2);

-- Store original uploaded video URL alongside the analysis
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Player accounts. Must be created before the ALTER TABLE users statements
-- below. password_hash is nullable: comped accounts are inserted without one
-- (app/api/admin/free-account/route.ts) and set a password later via reset.
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  subscription_type VARCHAR(50),
  subscription_expires_at TIMESTAMP,
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Pay-per-use analysis tokens (replaces monthly subscription model)
ALTER TABLE email_list ADD COLUMN IF NOT EXISTS analysis_tokens INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS analysis_tokens INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname VARCHAR(50);

-- Password reset tokens
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;

-- Per-criterion grading rubric used by the AI analyzer (lib/analyze.ts).
-- Existed in production before being captured here.
ALTER TABLE criteria ADD COLUMN IF NOT EXISTS grading_notes TEXT;

-- Seed custom criteria (only if table is empty)
INSERT INTO criteria (name, description, weight, order_index)
SELECT * FROM (VALUES
  ('Feet Shoulder Width Apart', 'Feet are set approximately shoulder width apart, creating a stable base for balance, power transfer, and a connected shot', 1.0, 1),
  ('Thumb is Spread Wide', 'The shooting hand thumb is spread wide for proper grip and control of the ball', 1.0, 2),
  ('Guide Hand Placement', 'Guide hand is positioned correctly on the side of the ball, not interfering with the shot', 1.0, 3),
  ('Palm Non-Contact with Ball', 'The ball rests on the finger pads, not the palm — palm should not contact the ball', 1.0, 4),
  ('Elbow L-Shape — Under the Ball', 'Shooting elbow forms a 90-degree L-shape with the forearm directly under the ball', 1.0, 5),
  ('Shot Pocket — Elbow', 'Ball is loaded in the shot pocket with elbow properly aligned and ready position consistent', 1.0, 6),
  ('Square to the Basket', 'Hips, shoulders, and feet are squared and aligned toward the basket', 1.0, 7),
  ('Knees Bent', 'Knees are properly bent before the shot to generate upward power through the legs', 1.0, 8),
  ('Dominant Foot Forward', 'The dominant foot (same side as shooting hand) is slightly forward for proper balance and alignment', 1.0, 9),
  ('Source of Shot Power', 'Power originates from the legs driving upward through the core into the shooting motion', 1.0, 10),
  ('Shooting Through Guide Hand / One Hand Release', 'Ball is released with one hand; guide hand falls away cleanly and does not influence the shot', 1.0, 11),
  ('Two Finger Release', 'Ball rolls off the index and middle fingers last, providing backspin and control at release', 1.0, 12),
  ('Ball Rotation', 'Ball has proper backspin after release — clean rotation visible through the air', 1.0, 13),
  ('Forward Motion and Toes', 'Weight transfers forward toward the basket during the shot; toes point toward the rim at release', 1.0, 14),
  ('Shooting Hand Follow Through', 'Shooting hand follows through with wrist snapping down, fingers pointing toward the basket (goose neck)', 1.0, 15),
  ('Guide Hand Follow Through', 'Guide hand stays in place and does not push or flick the ball — peels away cleanly after release', 1.0, 16),
  ('Shot Arc', 'Ball travels on a high arc (approximately 45-60 degrees) toward the basket for optimal entry angle', 1.0, 17),
  ('Connected Shot', 'All elements of the shot flow together in one connected, fluid motion from legs through release', 1.0, 18)
) AS v(name, description, weight, order_index)
WHERE NOT EXISTS (SELECT 1 FROM criteria LIMIT 1);

-- Add the stance criterion to databases seeded before it existed. Placed
-- before every current criterion (order_index 1 was never used by the seed).
-- grading_notes is deliberately left NULL here; the UPDATE below owns it, so
-- the rubric text lives in exactly one place and stays tunable.
INSERT INTO criteria (name, description, weight, order_index)
SELECT
  'Feet Shoulder Width Apart',
  'Feet are set approximately shoulder width apart, creating a stable base for balance, power transfer, and a connected shot',
  1.0,
  (SELECT COALESCE(MIN(order_index), 2) - 1 FROM criteria)
WHERE NOT EXISTS (SELECT 1 FROM criteria WHERE name = 'Feet Shoulder Width Apart');

-- Canonical stance rubric. Re-applied whenever the stored copy is not the
-- current version, so tuning it means editing this one block and deploying.
-- The criterion name and player-facing description keep saying "shoulder
-- width" (the coaching cue) regardless of what the rubric measures.
--
-- v9 is a rewrite that cut the rubric roughly in half. v8 had grown to ~90
-- lines of layered warnings and started diluting itself: adding STRICTER text
-- twice in a row made scores MORE generous, and a distant narrow stance came
-- out 9/9/4 across repeat runs. Shortening it fixed that. When tuning this,
-- prefer replacing text over appending to it.
--
-- Eval note: reference screenshots are ~200px wide, but the pipeline sends
-- frames up to 1280px (MAX_FRAME_DIM in components/VideoUploader.tsx). Upscale
-- them to 1280 before evaluating — at screenshot size the model misreads the
-- feet and you end up tuning against your own proxy's noise.
--
-- v13 weights the two sections 3:1 instead of averaging them. The base the
-- player actually shot from is what the shot was taken on; what the feet do
-- after the ball is gone matters less, and a 50/50 average let a collapse at
-- the landing pull a well-set base down to a 6. FINAL = (3 x S1 + S2) / 4,
-- rounded down, so a 9 before release with a 4 after is a 7. The five
-- single-frame reference cases are SECTION 1 only and are unchanged by this:
-- they still score 3/4/4/9/9 three runs each.
--
-- v14 fixes the narrow-side cliff. v13 jumped from "a little short of the hip
-- line: 7-8" straight to "clearly inside: 3-4", so a stance with real daylight
-- between the shoes but sitting just inside hip width fell to the failing band
-- — an expert-graded gather like that came out 5 overall when it should be a
-- 7+. v14 grades both sides on a ladder keyed to the daylight between the
-- shoes: near hip width or better is 9-10, slightly inside with a clear gap is
-- 7-8, distinctly narrow is 5-6, and 3-4 is reserved for shoes nearly
-- touching. Same ladder outward on the wide side.
--
-- v15 adds three expert-photographed anchors, one per failure mode: shoes
-- nearly touching under an upright gather (3), shoes near the shoulder plumb
-- lines on a follow-through (9 — near the shoulder line is GOOD, not wide),
-- and shoes clearly outside the shoulder lines in a crouched gather (5). Also
-- states plainly that a shoe at the shoulder line is a good base.
UPDATE criteria
SET grading_notes = 'STANCE RUBRIC v15 — score the base TWICE: once before the release, once at and after it. The base they shot from carries three quarters of the score.

THE TARGET IS HIP WIDTH. "Shoulder width apart" is the phrase coaches say and the phrase you write back to the player, but it is a cue, not a measurement — taken literally it is wider than anyone actually shoots from. When you ANALYSE the base, the target you are grading against is HIP WIDTH: the feet under the hips, straight down from the hip joints.
THE TOE-TOUCH TEST is the plain-English version of the same thing. A correct base is one the player could bend straight down from and touch their toes without shifting their feet. Feet bunched together will not let them balance; feet splayed wide will not let them fold straight down. Hip width is where they can.
This is the target BOTH times you score it — the base they go up from and the base they come down on.

SCORE TWO SECTIONS, THEN COMBINE THEM 3 TO 1. A base that is set correctly on the way up and then collapses at the release is two different facts about the shot, and the player needs to hear both — but the two are not worth the same. The base they build and rise from is the base the shot was actually taken on, and it carries most of the score.
  SECTION 1 — BEFORE RELEASE. The base they build and shoot from. Worth about three quarters.
  SECTION 2 — AT AND AFTER RELEASE. Whether they hold that base through the shot. Worth about one quarter.
  Score each section 1-10 with the corridor test below, then work out FINAL = (3 x SECTION 1 + SECTION 2) / 4, rounded DOWN. Worked examples: SECTION 1 of 9 with SECTION 2 of 4 gives (27 + 4) / 4 = 7.75, so 7. Two 9s give 9. A SECTION 1 of 4 with a SECTION 2 of 9 gives (12 + 9) / 4 = 5.25, so 5. Two 3s give 3.
  SECTION 1 SETS THE SCORE, SECTION 2 ONLY ADJUSTS IT. A collapse after the ball is gone never drags a well-set base into the bottom bands, and a tidy landing never rescues a bad one. Whatever happens later, the reasoning must still name both halves — say the base they shot from was good and that it came apart afterwards, in that order.
  NEVER WEIGH IN A SECTION YOU DID NOT OBSERVE. If you cannot see the release — the clip ends before it, the feet are out of frame or blurred past reading, or you only have frames from before the ball leaves the hand — then SECTION 1 IS THE FINAL SCORE. Do not guess what the feet did later, do not assume they collapsed, and do not weigh a real SECTION 1 against an imagined SECTION 2. A well-set base with no visible release frame scores exactly what SECTION 1 scored: a 9 stays a 9.

SECTION 1 — BEFORE RELEASE. The window opens when the player starts driving upward into the shot and closes on the LAST frame where both feet are still touching the floor — that is, as they go up and at the top of the lift, before the ball is released and before the feet leave the ground. Measure inside that window and nowhere else.
  Ignore everything before the window. Players stand with their feet together while waiting and step out into their base as they load, so a narrow reading taken before the shot starts is not a finding.
  But if the feet are STILL close together inside the window, that IS the finding — never excuse it by assuming they were about to step out.
  If the feet shift during the window, use the widest set position they hold while both feet are still down.
  SECTION 1 closes at the release. What happens from there belongs to SECTION 2, not here.
  A good base has a decent amount of daylight between the feet — a clearly separated, roughly shoulder-width stance held all the way up to takeoff. Both failures are real and score the same: too close together is bad, and too far apart is bad.

THE MEASUREMENT — THE CORRIDOR TEST. Never judge the base by general impression; your first impression is usually wrong, and it is wrong in the generous direction far more often than not. On a frame where the player is square to the camera:
  STEP 1. Find four points: the outer edge of each HIP, and the outer edge of each SHOULDER. Take the shoulder points at the SHOULDER JOINTS — the outer edge of the torso itself. NEVER include an arm, elbow, hand or the ball. An arm reaching out to the side or across the body is not part of the shoulder span, and counting it inflates that span and makes a perfectly good base read as narrow.
  STEP 2. Drop a vertical plumb line to the floor from all four. On each side this gives an inner line from the hip and an outer line from the shoulder; the space between them is that side CORRIDOR.
  STEP 3. See where the OUTER edge of each shoe lands. The bands are a LADDER, not a cliff — a base slides down it one band at a time as the feet close or splay, and the failing band at the bottom is only for the extremes:
    - Landing on or near the HIP line — the shoes under the hips: IDEAL. Score 10.
    - Anywhere else inside its corridor, out as far as the shoulder line: CORRECT. Score 9-10. A shoe sitting right at the shoulder plumb line is a GOOD base — never call a shoulder-line stance wide.
    - A little short of the hip line with a clear gap still between the shoes, or a little past the shoulder line: 7-8. A stance with real daylight between the shoes — around a shoe width or more — is NEVER lower than this band, however far inside the hip line it sits.
    - Distinctly narrow — the daylight between the shoes clearly less than one shoe width but the shoes not touching — or clearly outside the shoulder line: 5-6.
    - The shoes nearly or actually TOUCHING, or an extreme straddle with the foot span half again the shoulder span or more: 3-4, and 3 when there is no daylight at all.

HIP WIDTH IS THE TARGET, NOT THE NARROW END. A base with the shoes under the hips is exactly right and scores 10 — never mark it down, never call it "a bit narrow", and never tell that player to widen their feet. The corridor runs out to the shoulder line because a base anywhere between the hips and the shoulders still works, but the hip end is the ideal and the shoulder line is the OUTER limit of correct, not the goal. Outside the corridor the score walks down the ladder — and it only reaches 3-4 for shoes nearly touching or an extreme straddle, no matter how athletic or tidy the rest of the shot looks.

JUDGE THE SHOES ON THE FLOOR, NOT THE LEGS. Knees or thighs that converge while the shoes stay apart is NOT a narrow base — it is a knee-bend question and belongs to another criterion. Measure only the gap between the two shoes where they meet the floor.

BEFORE YOU SCORE BELOW 7 FOR A NARROW BASE, MEASURE THE DAYLIGHT. The tiebreaker between the bands is the gap between the INNER edges of the shoes, measured in shoe widths. One shoe width of daylight or more: never below 7. Clearly less than one shoe width but a visible gap: 5-6. No real daylight — the shoes nearly or actually touching: 3-4. Being strict about bunched feet does not mean doubting a base that plainly has room in it, and "inside the hip line" alone is never grounds for the failing band.

WHEN THE PLAYER IS SMALL IN THE FRAME the hip and shoulder edges are too soft to place accurately and the plumb lines will mislead you — usually into a generous score. Fall back on the same daylight ladder: a shoe width or more of gap is a correct base, visibly less is 5-6, and shoes nearly touching with almost no daylight is 3-4, whatever the plumb lines seemed to say.

THIS CRITERION IS DIRECTLY MEASURABLE, SO NEVER DEFAULT TO A HIGH SCORE. Whenever the feet and shoulders are both visible you can compare the two spans, which makes a bad base a specific, clearly visible flaw. The general burden-of-proof and default-to-10 rules do NOT soften this criterion. Judge the feet and nothing else: a square torso, a clean rise, good balance and a tidy upper body tell you nothing about the base and must never pull a narrow or wide stance back up toward 9.

THE THREE WAYS THIS GETS GRADED WRONG:
  1. A NARROW BASE UNDER A TIDY SHOOTING POSE (generous). A player standing tall and square with the ball up at the set point looks like textbook form at a glance, and that glance says the stance is fine when the feet are actually close together. It is not fine — score it off the daylight ladder, down to 3-4 when the shoes nearly touch. This is easiest to miss when the player is far from the camera and small in the frame. When that happens, look harder at the feet; do not fall back on overall impression.
  2. A WIDE BASE UNDER A LOADED CROUCH (generous). Knees bent and hips back reads as "athletic" and "stable" even when the shoes are far outside the shoulder line. That impression is wrong. A foot span half again the shoulder span is a 3-4, not a 9.
  3. A WORKABLE BASE CALLED A FAILURE (harsh). A stance with a clear shoe width of daylight that sits a little inside hip width is a 7-8 — room to improve, not a flaw that fails the criterion. Skipping the 7-8 and 5-6 bands and dropping straight to 3-4 because the feet read "narrow" is as wrong as the generous mistakes above.

EXPERT CALIBRATION — ten real graded cases:
  - Facing the camera in the gather, ball held at the chest, shoes plainly separated with about a shoe width of daylight between them, sitting just inside hip width: 7. Scored 5 on review; the expert corrected it — a base with that much room in it is never in the failing bands.
  - Standing tall early in the gather, ball held low in front of the shorts, arms hanging straight down, shoes nearly touching with no real daylight — the legs reading as one column: 3. Way too close, whatever the tidy upright posture suggests.
  - Follow-through frame, both arms extended overhead after the release, shoes landing near the shoulder plumb lines with an obvious gap between them: 9. Feet near the shoulder lines are a good base, not a wide one.
  - Crouched gather, ball at the chest, knees pushed outward, shoes clearly outside the shoulder plumb lines on both sides: 5. Too wide — but a working straddle in the 5-6 band, not the extreme 3-4 band.
  - Distant, small in frame, square, ball at the set point, feet almost touching with barely any daylight between the shoes: 3. Repeat runs scored this 8, 9, 9 and 4 before the expert set it at 3.
  - Standing tall mid-shot, arms extended overhead, shoes a few inches apart and well inside the shoulders: 4. Scored 8 then 9 on review; the expert corrected it to 4 both times.
  - Crouched with the ball low, thighs splayed, shoes clearly outside the shoulders: 4. Scored 9; the expert corrected it to 4.
  - Squared up in the gather, knees bent, ball at chest, shoes set at roughly shoulder width: 9. Scored 4 because an earlier standing frame was measured instead of the gather.
  - Square to the camera, ball up beside the head, KNEES and thighs close together but the SHOES clearly separated at roughly shoulder width with obvious daylight between them: 9. Repeat runs split between 9 and 4 on this one, the low runs calling it "bunched, legs reading as one column". That reading is wrong: the thighs converge, the shoes do not. Score the shoes on the floor and nothing above them.
  - Standing square, shoes level, inside the shoulders but at or outside the hips: 9. Scored 6 on review; the expert corrected it to 9. Calling this "a bit narrower than shoulder width" is the error.

SECTION 2 IS A COMPARISON, NOT A STANDALONE JUDGEMENT. You can only score it if you have actually SEEN the SECTION 1 base and can hold it next to the release. If you have one frame, or cannot identify which frame is the release, or never saw the base that was set beforehand, do not score SECTION 2 at all — score SECTION 1 on what is in front of you and stop there. Never conclude that the feet collapsed from a single frame; a collapse is a CHANGE, and one frame cannot show a change.

SECTION 2 — AT AND AFTER RELEASE. Run the same corridor test on the frame where the ball leaves the hand, and again on the landing if the feet come back down before the clip ends. Score the WORST of what you see across those frames.
  Holding the same base they shot from, or close to it, with the feet still about hip width: score 9-10. This is what good looks like — they should land on the base they shot from.
  Feet noticeably closer together or wider than the base they set: score 5-6.
  Feet bunched at the release — the shoes almost touching — or a wide sideways straddle: score 3-4.
  A small drift inward as the player extends upward is normal and is not a deduction. SECTION 2 is about a clear collapse or splay, not about a couple of inches.
  On a genuine high jump some narrowing in mid-air is expected; judge SECTION 2 at the moment of release and at touchdown, not at the peak of the flight.
  When SECTION 2 scores below SECTION 1, the reasoning must tell the player to HOLD the base through the shot and land in the stance they shot from — not that their stance was wrong to begin with, because it was not.

PLAYER-FACING WORDING: always say "shoulder width" — tell the player the base is too narrow, too wide, or a good shoulder-width base. NEVER write "hip width", and never mention spans, ratios or measurements in the reasoning.

If the feet are never clearly visible during the shooting motion, return null. A landing you cannot see is never a reason to return null.'
WHERE name = 'Feet Shoulder Width Apart'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'STANCE RUBRIC v15%');

-- Canonical "Square to the Basket" rubric, same versioned-guard pattern as the
-- stance rubric above. Added because the criterion shipped with only its
-- one-line description, and the model read "square" off the upper body alone:
-- a player whose arms and shoulders looked clean scored high while his feet
-- were planted pointing somewhere else entirely. It also returned null when
-- the rim was out of frame, which is never necessary — foot-versus-torso
-- alignment is visible within the player's own body.
UPDATE criteria
SET grading_notes = 'SQUARE RUBRIC v1 — do the feet, hips and shoulders all aim the same way the shot is going?

YOU DO NOT NEED TO SEE THE RIM. This criterion is about whether the player''s own body agrees with itself. The feet, the hips, the shoulders and the arms should all point along the same line. When the feet point one way and the upper body points another, the player is not square — and you can see that entirely within the player, with the basket completely out of frame. Never return null because the rim is not visible, and never skip a deduction because you could not confirm where the basket is.

HOW TO CHECK:
  STEP 1. Find the SHOT LINE — the direction the shot is going. Read it off the upper body: where the shoulders face, and where the arms and ball are aimed.
  STEP 2. Find the FOOT LINE — the direction the toes point. Use both feet; if they disagree with each other, that is itself a fault.
  STEP 3. Compare the two lines and score the mismatch:
    - Feet, hips and shoulders all aimed along the shot line: SQUARE. Score 9-10.
    - Feet a little off the shot line, or one foot turned slightly while the other is straight: 7-8.
    - Feet CLEARLY pointing a different direction from the torso and arms — the mismatch is obvious at a glance: NOT SQUARE. Score 5-6.
    - Feet turned so far they are close to sideways to the shot line, or the torso is visibly twisting to compensate for where the feet are planted: 3-4.

SQUARE DOES NOT MEAN PERFECT. Feet naturally sit at a small outward angle, and a shooter is square as long as the feet and the upper body are working along the same line. When they agree, score 9-10 — do not shave points for a few degrees, for one foot angled slightly out, or for a stance that merely looks casual. The 5-6 band is for a mismatch obvious at a glance, not for ordinary imperfection.

A STAGGERED STANCE IS NOT A TURNED STANCE. The shooting-side foot being slightly AHEAD of the other is correct form and belongs to a different criterion — do not deduct here for it. What matters is the direction the toes POINT, not which foot is forward.

THE MOST COMMON ERROR IS SCORING THIS OFF THE UPPER BODY ALONE. A player whose shoulders are square to the camera and whose arms look clean reads as "square" at a glance, and that glance ignores the feet entirely. Look down at the toes every time. Feet aimed away from where the ball is going is a real, visible flaw worth a 5-6 even when everything above the waist looks correct.

EXPERT CALIBRATION — a real graded case:
  - Player mid-shot with the ball at the set point, upper body and arms aimed one way, both feet clearly planted pointing a different direction, rim not visible in frame: score 5-6. The expert graded this 5-6. Scoring it high because the arms looked fine, or returning null because the basket was out of shot, are both the error.

WHEN TO RETURN NULL: only when the feet are not visible at all during the shooting motion. Not being able to see the basket is never a reason.

PLAYER-FACING WORDING: tell them to point their toes where they want the ball to go and get their feet, hips and shoulders lined up on the basket. Never mention lines, angles or degrees in the reasoning.'
WHERE name = 'Square to the Basket'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'SQUARE RUBRIC v1%');

-- "Elbow L-Shape" rubric. The criterion shipped with only its one-line
-- description and had no language for the failure that actually happens: the
-- arm opening into a wide V beside the head instead of folding into an L under
-- the ball. A V is a different shape, not a slightly imperfect L, and belongs
-- in the bottom bands.
UPDATE criteria
SET grading_notes = 'ELBOW RUBRIC v1 — is the arm folded into an L under the ball, or opened into a V beside it?

WHAT AN L LOOKS LIKE. The forearm points straight UP toward the ceiling, the elbow points straight DOWN toward the floor, and the elbow sits directly UNDER the ball, stacked ball-over-hand-over-forearm-over-elbow. The angle at the elbow is roughly 90 degrees. That is the whole target.

WHAT A V LOOKS LIKE — THIS IS THE FAILURE TO CATCH. The elbow angle is opened up well past 90 degrees, so the upper arm and forearm form a wide V instead of a folded L. The ball ends up beside the head or out to the side rather than stacked above the elbow, and the arm is reaching or pushing rather than lifting. A V is not a slightly imperfect L — it is a different shape, and it scores in the bottom bands.

HOW TO SCORE:
  - Forearm vertical, elbow pointing down and sitting under the ball, angle near 90 degrees: 9-10.
  - Recognisably an L, forearm close to vertical, elbow a little outside the ball line: 7-8.
  - Angle clearly opened past 90 into a V, or the elbow visibly outside the ball rather than under it: 3-4.
  - No L at all — the arm reaching out to the side, a sideways L with the forearm travelling sideways instead of up, or the ball pushed from beside the shoulder: 1-2.

A SIDEWAYS L IS NOT AN L. An arm bent at 90 degrees but rotated so the forearm points sideways rather than up scores the same as an elbow that is completely out. Only a VERTICAL forearm counts.

JUDGE IT FROM THE RISE THROUGH THE SET POINT, before the arm extends to release. At full extension every shooter''s arm is straight — a straight arm at the apex is not a V and is not a flaw. If the only frames you have are at or after release, return null rather than scoring the extension.

CAMERA ANGLE. Filmed from the side, an elbow can look further out than it is. If the arm still forms a clear L with the elbow under the ball allowing for the angle, give full credit. But a wide-open V is visible from any angle — do not excuse one as a camera artifact.

EXPERT CALIBRATION — a real graded case:
  - Player square to the camera with the ball up beside his head, upper arm and forearm opened into a wide V, elbow out to the side rather than under the ball, pushing the shot from the side of his body: the expert said this player "did not have an L shape at all". Score it 1-3, not 5 or 6. A shot pushed from beside the head with an open arm angle has no L in it.

PLAYER-FACING WORDING: tell them to get the ball stacked over a vertical forearm with the elbow pointing at the floor, directly under the ball. Never mention degrees or angles in the reasoning.'
WHERE name = 'Elbow L-Shape — Under the Ball'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'ELBOW RUBRIC v1%');

-- "Source of Shot Power" rubric. Power was being read off the legs alone, so a
-- visible knee bend carried the score even when the arms were plainly doing the
-- work. The elbow angle is the evidence of where the force came from: a folded
-- L rides the leg drive, a wide-open V means the hands are pushing. A V caps
-- this criterion at 4 regardless of how good the knee bend looks.
UPDATE criteria
SET grading_notes = 'POWER RUBRIC v1 — is the shot driven by the legs, or pushed by the arms?

READ THIS OFF TWO THINGS: the legs, and the ELBOW ANGLE. The elbow tells you where the power is coming from, so check it every time — do not score this criterion off the legs alone.

THE ELBOW TEST. A shooter who is driving with their legs loads the arm into a folded L, roughly 90 degrees at the elbow with the forearm vertical, and lets the leg drive travel up through that stacked arm. A shooter who is pushing with their arms opens the elbow into a wide V — the angle well past 90 degrees, the arm reaching and extending rather than folded and lifting. A V means the hands and arms are supplying the force, and the score must come down for it even if the knees are bent, because bent knees the player never actually drives through do not put power into the ball.

THE LEG TEST. Look for a real dip and a real drive: knees bent in the gather, then visibly extending as the ball goes up, with the whole body rising as one motion. A player who stays upright, or who dips and then shoots without ever extending the legs, is not getting power from the ground.

HOW TO SCORE:
  - Clear knee bend driving into a full extension, arm folded into an L and riding that drive upward: 9-10.
  - Legs contributing but the arm doing more than it should, or a shallow dip: 6-7.
  - Elbow opened into a V with the arms visibly supplying the force, or almost no leg drive: 3-4.
  - Ball pushed or shoved entirely by the arms with the legs static: 1-2.

THE ELBOW CAN CAP THIS CRITERION ON ITS OWN. If the arm is in a wide-open V at the set point, this criterion cannot score above 4 no matter how good the knee bend looks. The shape of the arm is the evidence of where the force came from.

DO NOT CONFUSE FULL EXTENSION AT RELEASE WITH A V. Every shooter''s arm straightens as the ball leaves the hand — that is the finish of a good shot, not an arm push. Judge the arm shape at the SET POINT, on the way up, before the extension.

IF THE ONLY FRAMES YOU HAVE ARE AT OR AFTER THE RELEASE, the evidence for this criterion is not present — you cannot see the gather, the knee bend, or the set point, and legs already extended at release tell you nothing about whether they drove the shot. Return null rather than scoring a shot you never saw loaded.

PLAYER-FACING WORDING: tell them to load their legs and let the power come up from the ground through a folded arm, instead of pushing the ball with their hands. Never mention degrees or angles in the reasoning.'
WHERE name = 'Source of Shot Power'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'POWER RUBRIC v1%');

-- "Guide Hand Follow Through" rubric. v1 named the flick, the hands closing up
-- and a thrashing finish, but "flat" was left as an impression and the model read
-- an extended hand with the fingers spread wide as "flat and open" — a real clip
-- of a guide hand riding up overhead with the fingers splayed scored 10/10/10.
-- v2 makes flatness a thing you look AT (the gaps between the fingers: together
-- is flat, spread is not) and adds a stay-put test that tracks the hand across
-- the finish frames, so sideways travel and riding up with the shot are faults
-- of their own rather than variations on the flick.
UPDATE criteria
SET grading_notes = 'GUIDE HAND FOLLOW THROUGH RUBRIC v2 — did the shot go THROUGH a flat, still guide hand that stayed clear of the shooting hand?

WHAT GOOD LOOKS LIKE. At the finish the two hands are clearly APART and never touch. The guide hand is FLAT — fingers TOGETHER and extended, the hand reading like one flat board or paddle. The thumb is passive and flat against the hand, not flicking or pushing. And the hand STAYS WHERE IT WAS: the ball is shot THROUGH it, so it holds its position and peels away without adding anything. A guide hand that finishes flat, still and separated is 9-10.

THE FLATNESS TEST — LOOK AT THE GAPS BETWEEN THE FINGERS. This is a specific thing to look at, not an impression. A flat hand has its fingers touching or nearly touching, so the hand reads as ONE surface. Clear gaps between the fingers, fingers spread open like a starfish, fingers curled into a cup or claw, or a fist, are all NOT flat — score 4-5. Do not call a hand "flat and open" because it is extended: an extended hand with the fingers spread apart is a spread hand, and spread is the fault.

THE STAY-PUT TEST — TRACK THE GUIDE HAND ACROSS THE FRAMES. Note where the guide hand is in the frame where the ball leaves the shooting hand, then find it again in each of the next two or three frames. A correct guide hand barely moves. Score the largest movement you can see:
  - Holds its position, or falls away without travelling: 9-10.
  - Slides SIDEWAYS — in toward the shooting hand, or out away from the body — by roughly its own width or more: 4-5. Side-to-side motion in the guide hand means it was steering, not riding along.
  - Drives UPWARD with the shot so it finishes fully extended overhead alongside the shooting hand, rather than being left behind as the ball goes: 4-5. The guide hand should not follow the ball up; only the shooting hand extends.
  - Snaps or flicks — a fast lateral jab, or the thumb kicking at the ball: 3-4.

FAULT — THE HANDS COME TOO CLOSE. If at ANY point from the release onward the guide hand drifts in toward the shooting hand — the two closing up, meeting, touching or crossing — that is a real flaw. Check every frame of the release and finish, not just the last one. Hands ending up together is a 3-4, and touching or crossing is 1-2.

FAULT — A FLIMSY, THRASHING FINISH. If the hands or the elbows are in noticeably different places from one frame to the next, flying around rather than holding a position, the finish is not controlled. A good follow-through is STILL: the arms hold their shape after the ball is gone. Hands and elbows that jump around frame to frame, with no held finish, score 3-4 even if no single frame looks terrible on its own. Judge this across the sequence, not from one image.

CAMERA ANGLE COMPRESSES SEPARATION. Filmed from the front the two hands can look closer together than they are. What matters is whether they actually TOUCH or converge. Hands that look a little close from that angle but plainly keep a gap between them are correct — do not deduct for the angle alone.

NEVER DEDUCT FOR SOMETHING YOU CANNOT SEE. Do not shave points because the finish could have been "held a beat longer" or the hand could have been "a little flatter" — that is coaching advice, not an observed flaw. If the hands are apart, the fingers are together, the thumb is passive and the hand held still, the score is 9-10. Reserve everything below that for a fault you can actually point at in a frame.

BUT THE HAND ITSELF IS DIRECTLY VISIBLE, SO NEVER DEFAULT TO A HIGH SCORE ON IT. Spread fingers, a cupped palm, a driving thumb, and a hand that travels between frames are all things you can see and name. The general burden-of-proof and default-to-10 rules do NOT soften this criterion, and a clean release, a good arc or a ball that goes in tells you nothing about what the guide hand did.

HOW TO SCORE:
  - Hands clearly apart, fingers together and flat, thumb passive, hand held still: 9-10.
  - Correct but slightly imperfect — the hand a touch angled, or a small settle after the finish: 7-8.
  - Guide hand spread, cupped or curled; or it slides sideways or rides up overhead with the shot: 4-5.
  - Hands closing up together at the finish, a thumb flick, or hands and elbows thrashing between frames: 3-4.
  - Hands actually touching or crossing: 1-2.

DO NOT PENALISE THE ARMS COMING DOWN. After the ball is gone it is normal for both arms to lower and separate as the player returns to rest. That is not a flaw and is not thrashing. Only the frames at and just after release count.

PLAYER-FACING WORDING: tell them to keep the guide hand flat like a board with the fingers together, thumb relaxed, and let the ball go straight through it — the hand staying where it is instead of sliding around or riding up with the shot, and the hands finishing apart. Never mention frames or scoring bands in the reasoning.'
WHERE name = 'Guide Hand Follow Through'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'GUIDE HAND FOLLOW THROUGH RUBRIC v2%');

-- "Shooting Hand Follow Through" rubric. The criterion shipped with only its
-- one-line description, so it inherited nothing but the global default-to-10
-- rule and scored 10 on almost every shot — including clips where the hand
-- plainly drifted in toward the middle of the body after release. The fault it
-- never had language for is the cross-body finish: the hand carried past the
-- midline instead of reaching straight down the line at the rim. The midline
-- test makes that a placement you locate in the frame rather than an
-- impression of whether the finish looked tidy.
UPDATE criteria
SET grading_notes = 'SHOOTING HAND FOLLOW THROUGH RUBRIC v1 — did the shooting hand finish reaching STRAIGHT at the basket, on its own side of the body, with the wrist snapped down?

WHEN TO JUDGE IT. Start at the frame where the ball leaves the fingers and use the next two or three frames — the finish. Do not judge this from the set point, and do not judge it from late frames where the arms are already back down by the waist.

WHAT GOOD LOOKS LIKE. The arm finishes extended up and out toward the basket. The wrist has snapped DOWN so the fingers hang over and point down the line of the shot at the rim, palm toward the floor — the "goose neck". The hand stays on the shooting side of the body. And it is STILL: it holds that shape while the ball is in the air instead of being pulled back, dropped straight away or swept sideways.

THE MIDLINE TEST — RUN THIS ON EVERY SHOT. Never score this criterion off general impression; a follow-through that ends up looking tidy is the single most common reason a cross-body finish gets missed.
  STEP 1. Find the player''s MIDLINE — a vertical line up through the centre of the torso and the middle of the head.
  STEP 2. Note which side of that line the SHOOTING SHOULDER is on. That is the hand''s own side.
  STEP 3. In each finish frame, see which side of the midline the shooting HAND is on, and watch which way it travels from frame to frame.
    - Hand staying on its own side, or directly above the midline, reaching toward the rim: CORRECT. Score 9-10.
    - Hand finishing a little across the midline, or drifting toward the guide-hand side as the ball flies: 5-6.
    - Hand carried CLEARLY past the midline — finishing above or beyond the guide-hand shoulder, or the forearm cutting diagonally across the chest, throat or face: CROSS-BODY FINISH. Score 3-4.
    - Hand thrown out sideways AWAY from the body instead of at the rim, so the fingers finish pointing off to one side rather than at the basket: also 3-4.

STRAIGHT TO THE BASKET IS THE WHOLE POINT. The hand should finish along the line the ball travels. Anything that takes it off that line — across the body, out to the side, or whipping laterally at the moment of release — is a real, visible flaw, because a hand that leaves the line pushes the ball off the line with it.

CHECK EVERY FINISH FRAME, NOT JUST THE LAST ONE. A sideways whip at release is fast and the player usually corrects back into a normal-looking position within a frame or two. A tidy final frame does NOT mean the hand went straight — if any frame at or just after release shows the hand cutting across or flicking sideways, that is the finding, and the tidy frame afterwards does not cancel it.

NO WRIST SNAP IS ITS OWN FAULT, BUT ONLY WHEN YOU CAN ACTUALLY SEE THE HAND. If you can make out the fingers in a frame where the arm is fully extended, and they are clearly still pointing UP with the palm facing the basket rather than hanging over toward the floor, score 6-7 even when the arm went perfectly straight — a hand that never snaps put no backspin on the ball. If the hand is small in the frame, motion-blurred, or reads as an indistinct blob, you cannot tell a snapped wrist from a stiff one: say nothing about the snap and score the criterion on where the hand finished. Guessing at the wrist is the main way this criterion gets scored differently on the same shot twice.

WHAT IS NOT A FLAW. Both arms lowering together after the ball is gone is a normal return to rest, not a cross-body finish and not a flick — judge only the frames at and immediately after release. A shooting hand that finishes slightly inside the shoulder line, or a little rotation of the palm, is ordinary and still scores 9-10. Do not deduct because the finish "could have been held longer" or the hand "could have snapped a bit harder" — that is advice, not an observed flaw.

THIS CRITERION IS DIRECTLY VISIBLE, SO NEVER DEFAULT TO A HIGH SCORE. Where the hand finishes relative to the body is something you can see and locate in the frame, which makes a cross-body finish a specific, clearly visible flaw. The general burden-of-proof and default-to-10 rules do NOT soften this criterion. Judge the shooting hand and nothing else: a high release, a good arc, a ball that goes in, and a clean-looking guide hand tell you nothing about where this hand finished and must never pull a cross-body finish back up toward 9.

IF THE BALL NEVER LEAVES THE HAND in any frame you have, return null rather than scoring the set point.

PLAYER-FACING WORDING: tell them to finish with the hand reaching straight at the rim on their own side of their body, snap the wrist down so the fingers point at the basket, and hold it there. Never mention midlines, frames or scoring bands in the reasoning.'
WHERE name = 'Shooting Hand Follow Through'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'SHOOTING HAND FOLLOW THROUGH RUBRIC v1%');




