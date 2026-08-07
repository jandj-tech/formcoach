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
UPDATE criteria
SET grading_notes = 'STANCE RUBRIC v11 — score the base TWICE: once before the release, once at and after it.

SCORE TWO SECTIONS, THEN COMBINE THEM. A base that is set correctly on the way up and then collapses at the release is two different facts about the shot, and the player needs to hear both.
  SECTION 1 — BEFORE RELEASE. The base they build and shoot from.
  SECTION 2 — AT AND AFTER RELEASE. Whether they hold that base through the shot.
  Score each section 1-10 with the corridor test below. The FINAL SCORE is the average of the two, rounded DOWN. A 9 before release and a 4 at release is a 6, not a 9 — and the reasoning must say the base started well and came apart at the release, naming both halves.
  NEVER AVERAGE AGAINST A SECTION YOU DID NOT OBSERVE. If you cannot see the release — the clip ends before it, the feet are out of frame or blurred past reading, or you only have frames from before the ball leaves the hand — then SECTION 1 IS THE FINAL SCORE. Do not guess what the feet did later, do not assume they collapsed, and do not average a real SECTION 1 against an imagined SECTION 2. A well-set base with no visible release frame scores exactly what SECTION 1 scored: a 9 stays a 9.

SECTION 1 — BEFORE RELEASE. The window opens when the player starts driving upward into the shot and closes on the LAST frame where both feet are still touching the floor — that is, as they go up and at the top of the lift, before the ball is released and before the feet leave the ground. Measure inside that window and nowhere else.
  Ignore everything before the window. Players stand with their feet together while waiting and step out into their base as they load, so a narrow reading taken before the shot starts is not a finding.
  But if the feet are STILL close together inside the window, that IS the finding — never excuse it by assuming they were about to step out.
  If the feet shift during the window, use the widest set position they hold while both feet are still down.
  SECTION 1 closes at the release. What happens from there belongs to SECTION 2, not here.
  A good base has a decent amount of daylight between the feet — a clearly separated, roughly shoulder-width stance held all the way up to takeoff. Both failures are real and score the same: too close together is bad, and too far apart is bad.

THE MEASUREMENT — THE CORRIDOR TEST. Never judge the base by general impression; your first impression is usually wrong, and it is wrong in the generous direction far more often than not. On a frame where the player is square to the camera:
  STEP 1. Find four points: the outer edge of each HIP, and the outer edge of each SHOULDER. Take the shoulder points at the SHOULDER JOINTS — the outer edge of the torso itself. NEVER include an arm, elbow, hand or the ball. An arm reaching out to the side or across the body is not part of the shoulder span, and counting it inflates that span and makes a perfectly good base read as narrow.
  STEP 2. Drop a vertical plumb line to the floor from all four. On each side this gives an inner line from the hip and an outer line from the shoulder; the space between them is that side CORRIDOR.
  STEP 3. See where the OUTER edge of each shoe lands:
    - Inside its corridor, or on either line: CORRECT. Score 9-10.
    - A little short of the hip line, or a little past the shoulder line: 7-8.
    - Clearly INSIDE the hip line, bunched toward the centre: TOO NARROW. Score 3-4, and 3 when the shoes are nearly touching.
    - Clearly OUTSIDE the shoulder line: TOO WIDE. Score 3-4.

THE CORRIDOR IS WIDE ON PURPOSE, AT BOTH ENDS. A base at hip width and a base at shoulder width are equally correct and both score 9-10 — never mark a player down for sitting at the hip end, and never write that a hip-width base is "a bit narrow" or "could be wider". Equally, never let that generosity cover a shoe that is outside its corridor: past the shoulder line or bunched inside the hip line is 3-4 no matter how athletic or tidy the rest of the shot looks.

JUDGE THE SHOES ON THE FLOOR, NOT THE LEGS. Knees or thighs that converge while the shoes stay apart is NOT a narrow base — it is a knee-bend question and belongs to another criterion. Measure only the gap between the two shoes where they meet the floor.

BEFORE YOU SCORE 3-4 FOR A NARROW BASE, CONFIRM THE SHOES ARE ACTUALLY BUNCHED. The 3-4 narrow band is for feet with almost no daylight between them — the shoes almost touching. If there is a clear gap between the inner edges of the shoes, one you could fit a shoe into, the base is NOT in that band: it is 9-10 if the shoes are inside their corridors and at worst 7-8 if they fall a little short of the hip lines. Being strict about bunched feet does not mean doubting a base that plainly has room in it.

WHEN THE PLAYER IS SMALL IN THE FRAME the hip and shoulder edges are too soft to place accurately and the plumb lines will mislead you — usually into a generous score. Fall back on the daylight between the shoes: a correct base has a clear gap between the inner edges roughly as wide as one shoe or more. Shoes nearly touching with almost no daylight is 3-4, whatever the plumb lines seemed to say.

THIS CRITERION IS DIRECTLY MEASURABLE, SO NEVER DEFAULT TO A HIGH SCORE. Whenever the feet and shoulders are both visible you can compare the two spans, which makes a bad base a specific, clearly visible flaw. The general burden-of-proof and default-to-10 rules do NOT soften this criterion. Judge the feet and nothing else: a square torso, a clean rise, good balance and a tidy upper body tell you nothing about the base and must never pull a narrow or wide stance back up toward 9.

THE TWO WAYS THIS GETS GRADED WRONG, BOTH OF THEM GENEROUS:
  1. A NARROW BASE UNDER A TIDY SHOOTING POSE. A player standing tall and square with the ball up at the set point looks like textbook form at a glance, and that glance says the stance is fine when the feet are actually close together. It is not fine — it is a 3-4. This is easiest to miss when the player is far from the camera and small in the frame. When that happens, look harder at the feet; do not fall back on overall impression.
  2. A WIDE BASE UNDER A LOADED CROUCH. Knees bent and hips back reads as "athletic" and "stable" even when the shoes are far outside the shoulder line. That impression is wrong. A foot span half again the shoulder span is a 3-4, not a 9.

EXPERT CALIBRATION — six real graded cases:
  - Distant, small in frame, square, ball at the set point, feet almost touching with barely any daylight between the shoes: 3. Repeat runs scored this 8, 9, 9 and 4 before the expert set it at 3.
  - Standing tall mid-shot, arms extended overhead, shoes a few inches apart and well inside the shoulders: 4. Scored 8 then 9 on review; the expert corrected it to 4 both times.
  - Crouched with the ball low, thighs splayed, shoes clearly outside the shoulders: 4. Scored 9; the expert corrected it to 4.
  - Squared up in the gather, knees bent, ball at chest, shoes set at roughly shoulder width: 9. Scored 4 because an earlier standing frame was measured instead of the gather.
  - Square to the camera, ball up beside the head, KNEES and thighs close together but the SHOES clearly separated at roughly shoulder width with obvious daylight between them: 9. Repeat runs split between 9 and 4 on this one, the low runs calling it "bunched, legs reading as one column". That reading is wrong: the thighs converge, the shoes do not. Score the shoes on the floor and nothing above them.
  - Standing square, shoes level, inside the shoulders but at or outside the hips: 9. Scored 6 on review; the expert corrected it to 9. Calling this "a bit narrower than shoulder width" is the error.

SECTION 2 IS A COMPARISON, NOT A STANDALONE JUDGEMENT. You can only score it if you have actually SEEN the SECTION 1 base and can hold it next to the release. If you have one frame, or cannot identify which frame is the release, or never saw the base that was set beforehand, do not score SECTION 2 at all — score SECTION 1 on what is in front of you and stop there. Never conclude that the feet collapsed from a single frame; a collapse is a CHANGE, and one frame cannot show a change.

SECTION 2 — AT AND AFTER RELEASE. Run the same corridor test on the frame where the ball leaves the hand, and again on the landing if the feet come back down before the clip ends. Score the WORST of what you see across those frames.
  Holding the same base they shot from, or close to it: score 9-10. This is what good looks like.
  Feet noticeably closer together or wider than the base they set: score 5-6.
  Feet bunched at the release — the shoes almost touching — or a wide sideways straddle: score 3-4.
  A small drift inward as the player extends upward is normal and is not a deduction. SECTION 2 is about a clear collapse or splay, not about a couple of inches.
  On a genuine high jump some narrowing in mid-air is expected; judge SECTION 2 at the moment of release and at touchdown, not at the peak of the flight.
  When SECTION 2 scores below SECTION 1, the reasoning must tell the player to HOLD the base through the shot and land in the stance they shot from — not that their stance was wrong to begin with, because it was not.

PLAYER-FACING WORDING: always say "shoulder width" — tell the player the base is too narrow, too wide, or a good shoulder-width base. NEVER write "hip width", and never mention spans, ratios or measurements in the reasoning.

If the feet are never clearly visible during the shooting motion, return null. A landing you cannot see is never a reason to return null.'
WHERE name = 'Feet Shoulder Width Apart'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'STANCE RUBRIC v11%');

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


