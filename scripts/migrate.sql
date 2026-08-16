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
--
-- v16, from an expert-graded two-frame case (S1 7 before release, S2 2 at the
-- landing, expected final 6): the blend now rounds to the NEAREST whole
-- number instead of down — floor gave that case a 5 and the expert wanted 6.
-- Also adds a 2-3 landing-collapse band to SECTION 2 (shoes nearly touching
-- or crossed at the landing), the paired case as a calibration anchor — the
-- gather was misread as "too close together" and dragged to a 4 overall when
-- a-little-close is a 7 — and a check that both shoes are actually visible
-- in the frames being measured before either section is scored.
--
-- v17: the STAGGERED stance defense. A set-point frame with the feet at
-- perfect shoulder width scored a 3 "too close" because the dominant foot
-- was ahead of the other — correct form that the front-on camera compresses
-- into apparently overlapping shoes. v17 adds the floor-between-the-legs
-- tell (floor visible between the lower legs = a separated base, full stop),
-- requires that tell to be checked before ANY "too close" call, and adds the
-- misread frame as an anchor.
UPDATE criteria
SET grading_notes = 'STANCE RUBRIC v21 — how many of the player''s own shoes would fit in the gap between their feet? Fewer than one is too narrow, three or more is too wide. Then take up to 2 points off if they did not hold it.

THE TARGET IS HIP WIDTH. "Shoulder width apart" is the phrase coaches say and the phrase you write back to the player, but it is a cue, not a measurement — taken literally it is wider than anyone actually shoots from. When you ANALYSE the base, the target you are grading against is HIP WIDTH: the feet under the hips, straight down from the hip joints.
THE TOE-TOUCH TEST is the plain-English version of the same thing. A correct base is one the player could bend straight down from and touch their toes without shifting their feet. Feet bunched together will not let them balance; feet splayed wide will not let them fold straight down. Hip width is where they can.
This is the target when you measure the base they shot from, and the same target when you check whether they came down on it.

THERE IS ONE SCORE, NOT TWO SCORES COMBINED. Do NOT score the shot twice and average or weight the results — that is how this criterion goes wrong. Work it out in two steps, and never let the player see the steps.
  STEP A — MEASURE THE BASE BEFORE THE RELEASE. Use the window described under THE BASE below, count how many shoes would fit in the gap between their feet, and read the band off that. Whatever that comes to IS the score. This is the base the shot was actually taken on, and it decides the mark.
  STEP B — THEN ONE ADJUSTMENT, DOWNWARD ONLY, NEVER MORE THAN 2 POINTS. Look at the release and the landing and ask one question: did the base they shot from come apart? If it clearly came apart — the shoes bunching nearly together, or splaying out into a wide straddle, plainly different from what they had on the way up — take 2 points off. If it came apart only slightly, take 1 off. If they held it, take nothing off. That is the entire calculation. There is no other arithmetic in this criterion.
  NEVER ADD POINTS FOR WHAT HAPPENS AFTER THE BALL IS GONE. A tidy landing does not rescue a base that was wrong to begin with. And if the feet look BETTER or wider after the release than the base they shot from, that is not worth anything either — there is simply nothing to take off, so the score stays exactly what STEP A measured. If your reading of the landing comes out better than your reading of the base, do not treat that as a finding and do not report it: deduct nothing and move on.
  IF YOU CANNOT SEE THE FEET AFTER THE RELEASE, SKIP STEP B ENTIRELY. The clip ending first, the feet leaving the frame, the player walking out of shot, or blur you cannot read — any of these means there is no deduction to make. Do not guess and do not assume they collapsed. The score is what STEP A measured: a 9 stays a 9.

THE BASE — BEFORE THE RELEASE. This is what STEP A measures. The window opens when the player starts driving upward into the shot and closes on the LAST frame where both feet are still touching the floor — that is, as they go up and at the top of the lift, before the ball is released and before the feet leave the ground. Measure inside that window and nowhere else.
  Ignore everything before the window. Players stand with their feet together while waiting and step out into their base as they load, so a narrow reading taken before the shot starts is not a finding.
  But if the feet are STILL close together inside the window, that IS the finding — never excuse it by assuming they were about to step out.
  If the feet shift during the window, use the widest set position they hold while both feet are still down.
  This window closes at the release. What happens from there belongs to STEP B, and can only ever cost points — never let it change the measurement you make here.
  A good base has a decent amount of daylight between the feet — a clearly separated, roughly shoulder-width stance held all the way up to takeoff. Both failures are real and score the same: too close together is bad, and too far apart is bad.

THE MEASUREMENT — USE THE SHOE AS THE RULER. Never judge the base by general impression. Your first impression is wrong in BOTH directions: bunched feet get waved through as fine, and perfectly good bases get called narrow. Use the shoe itself as the ruler. The shoe is the one object in the frame that sits right beside the thing being measured and is always about the same size, which is why this test still works on a player who is small and far away, where lines dropped from the hips and shoulders do not.
  STEP 1. Find the WIDTH OF ONE SHOE — the side-to-side width of a single shoe where it meets the floor, as it appears in this frame. If the two look different widths, take the average.
  STEP 2. Find the GAP — the bare floor between the INNER edge of one shoe and the INNER edge of the other. Shoes touching or overlapping means a gap of zero.
  STEP 3. ASK ONE QUESTION: HOW MANY OF THAT PLAYER''S SHOES WOULD FIT FLAT ON THE FLOOR IN THE GAP? Picture their own shoes laid down side by side in the space between their two feet, and count how many go in. Answer it that way, as shoes laid in a gap, not as a ratio — it is a physical question with a physical answer, and it holds steady where estimating a number does not. Both faults live on this one count, so you never have to decide separately whether a base is "narrow" or "wide": the number tells you which it is.
  STEP 4. Read the score off the count. THE GOOD BAND HAS AN EDGE AT BOTH ENDS — you must check that the count is not too big as carefully as you check it is not too small:
    - NONE — the shoes touching or all but touching, nothing could pass between them: 3.
    - LESS THAN ONE — a shoe plainly would not fit, the gap about half a shoe: 4-5. TOO NARROW.
    - ABOUT ONE, squeezed — you would have to force it: 6-7.
    - ONE OR TWO fit comfortably: the base is CORRECT. 9-10. This is the target.
    - ABOUT TWO AND A HALF — a third shoe nearly goes in: 6-7. Starting to splay.
    - THREE OR MORE fit in the gap: 4-5. TOO WIDE, and it does not matter how athletic or loaded the crouch looks.
  WHEN THE COUNT IS BETWEEN ONE AND TWO, CALL IT CORRECT. That is the target band and a borderline reading inside it is far more often a good base than a bad one. This tie-break applies ONLY between one and two shoes — it is not a licence to wave through a gap with three shoes in it.
  Note there is no 8 on this ladder. Either the base is in the good band or there is a real amount of room to find.

STEP 5 — THE SHOULDER CHECK. RUN IT EVERY TIME THE COUNT CAME OUT AT ONE OR MORE. It is not optional and it is not a formality: a 9-10 off the count above is PROVISIONAL until you have answered this, because the count on its own cannot tell a good roomy base from a splayed one. Find the outer edge of each SHOULDER JOINT — the outer edge of the torso, and NEVER an arm, elbow, hand or the ball, because a raised arm inflates that span — then drop a vertical line from each to the floor:
    - Both shoes inside those lines, or sitting right on them: confirmed NOT wide. Keep the 9-10 and stop.
    - Shoes clearly outside the shoulder lines: 5, whatever the count said.
    - Shoes so far outside that the foot span is half again the shoulder span: 4.
  Skip this step only when the count already came out below one, because a base whose shoes are close together cannot also be too wide.

THE PHRASE "A REASONABLE SHOULDER-WIDTH BASE" IS THE TELL THAT YOU SKIPPED STEP 5. A loaded crouch with the thighs pushed apart and the shoes planted well outside the shoulders reads as athletic and stable, and it is very easy to write it up as a solid base and move on to the landing. It is not a solid base — it is the wide fault, and it is a 4-5. Before you describe ANY base as good, shoulder-width or solid, say to yourself where the shoes are relative to the shoulder lines. If they are outside them, you may not call it good.

JUDGE THE SHOES ON THE FLOOR, NOT THE LEGS. Knees or thighs that converge while the shoes stay apart is NOT a narrow base — it is a knee-bend question and belongs to another criterion. Measure only the gap between the two shoes where they meet the floor.

WHEN THE SHOES OVERLAP IN THE IMAGE, MEASURE THE GAP HIGHER UP INSTEAD. Correct form puts the shooting-side foot slightly AHEAD of the other, and a front-on camera flattens that depth offset so the near shoe visually overlaps the far one. A base at a perfectly good width can then show a gap of zero at the shoes. The tell that you are in this situation: a strip of floor is visible BETWEEN THE LOWER LEGS, somewhere between the ankles and the knees — the legs reading as two columns, an A rather than a single post. When you see that, do not score the overlapping shoes as a zero gap. Measure the gap between the two LEGS at its widest visible point instead, still counting in shoe widths, and run the ladder on that. A genuinely bunched base shows the legs as ONE column with no floor between them at any height, and that one really is a 3.

WHEN THE PLAYER IS SMALL IN THE FRAME the shoe ruler is the only test you can trust, so use it and nothing else. Shoulder and hip edges go soft at distance and lines dropped from them will mislead you. The gap in shoe widths is still readable because both quantities shrink together — a half-shoe gap is a half-shoe gap whether the player is six feet from the camera or thirty.

THIS CRITERION IS DIRECTLY MEASURABLE, SO NEVER DEFAULT TO A HIGH SCORE. The gap and the shoe are both right there in the frame, which makes a bad base a specific, countable flaw. The general burden-of-proof and default-to-10 rules do NOT soften this criterion. Judge the feet and nothing else: a square torso, a clean rise, good balance and a tidy upper body tell you nothing about the base and must never pull a narrow or wide stance back up toward 9.

THE FOUR WAYS THIS GETS GRADED WRONG:
  1. A NARROW BASE UNDER A TIDY SHOOTING POSE (generous). A player standing tall and square with the ball up at the set point looks like textbook form at a glance, and that glance says the stance is fine when the feet are actually close together. Count the gap instead of trusting the pose.
  2. A WIDE BASE UNDER A LOADED CROUCH (generous). Knees bent and hips back reads as "athletic" and "stable" even when the shoes are far outside the shoulders. That impression is wrong.
  4. A SPLAYED BASE WRITTEN UP AS A GOOD ONE (generous, and the live failure of 2026-08-12). The count came out high, the crouch looked athletic, and the base was described as "reasonable shoulder-width" with the only deduction taken for the landing. A high count is a fault, not a pass — run the shoulder check before you praise any base.
  3. NARROW AND WIDE SWAPPED FOR EACH OTHER (both directions, and the worst of the three). A base gets called "too wide" when the shoes are actually close together, or "good" when they are nearly touching. This happens when the two faults are judged as one blurred question about whether the stance "looks right". They are not one question. Count the gap in shoe widths first and answer only that; a small number can NEVER mean too wide, and a base you scored 6-7 or below on the gap ladder is FORBIDDEN from being described as wide.

MEASURED CALIBRATION — every case below has its gap measured against the width of that player''s own shoe, so you can check your own answer to the fit question against a graded example:
  - COUNT 0 — nothing could pass between the shoes. Distant and small in frame, square, ball at the set point: 3. Repeat runs scored this 8, 9, 9 and 4 before the expert set it at 3.
  - COUNT under 1 — a shoe plainly would not fit, the gap two fifths of a shoe. Set point, ball up beside the head, square to a front-on camera, floor visible between the lower legs: 4-5. The expert graded this 4-5 on review. Note the floor between the legs does NOT lift it out of the band — that tell only tells you the shoes are not fused, and this gap is still under half a shoe.
  - COUNT 1 — one shoe fits exactly. Crouched gather, ball at the chest: 9.
  - COUNT between 1 and 2 — a shoe fits with room to spare, and the shoes sit inside the shoulder lines. Squared up in the gather, knees bent, ball at chest: 9. Scored 4 once because an earlier standing frame was measured instead of the gather.
  - COUNT nearly 4, shoes clearly outside the shoulder lines, crouched with the ball low and thighs splayed: 4.
  - COUNT about 3 and a half, loaded crouch with the ball up at the set point, thighs pushed apart, shoes planted well outside the shoulder lines: 4-5. Graded by the expert on 2026-08-12 with the words "way too much separation, it looks uncomfortable". A live analysis had called this same base "a reasonable shoulder-width base" and scored the shot 7 — the wide fault was missed entirely because the count was never checked against the top of the good band.

EXPERT CALIBRATION — further graded cases:
  - Set point, ball raised overhead in both hands, square to a front-on camera, shooting-side foot slightly ahead so the shoes partly overlap in the image — but clear floor visible between the lower legs and the feet plainly about shoulder width apart: 9-10. Scored 3 "too close" on review; the expert called it "perfect shoulder width apart". The staggered foot compressed the apparent gap — the floor between the legs was the truth.
  - A TWO-FRAME PAIR. Gather frame before release: square to the camera, ball up in both hands, shoes plainly separated with visible daylight, a little inside hip width — STEP A measures 7. On review this frame was called "feet too close together to begin with" and the shot dragged to a 4 overall; the expert rejected that reading — a-little-close with real daylight is a 7, not a failing base. Landing frame after release: the shoes have swung nearly together, almost touching — the base came apart, so STEP B takes 2 off, giving 5. The feedback tells the player the base they shot from was fine and the landing collapsed, in that order.
  - Facing the camera in the gather, ball held at the chest, a gap just under one shoe width: 7. Scored 5 on review; the expert corrected it — a base with that much room in it is never in the failing bands.
  - Standing tall early in the gather, ball held low in front of the shorts, arms hanging straight down, shoes nearly touching with no real daylight — the legs reading as one column: 3. Way too close, whatever the tidy upright posture suggests.
  - Follow-through frame, both arms extended overhead after the release, shoes landing near the shoulder plumb lines with an obvious gap between them: 9. Feet near the shoulder lines are a good base, not a wide one.
  - Crouched gather, ball at the chest, knees pushed outward, shoes clearly outside the shoulder plumb lines on both sides: 5. Too wide — but a working straddle in the 5-6 band, not the extreme 3-4 band.
  - Standing tall mid-shot, arms extended overhead, shoes a few inches apart and well inside the shoulders: 4. Scored 8 then 9 on review; the expert corrected it to 4 both times.
  - Square to the camera, ball up beside the head, KNEES and thighs close together but the SHOES clearly separated at roughly shoulder width with obvious daylight between them: 9. Repeat runs split between 9 and 4 on this one, the low runs calling it "bunched, legs reading as one column". That reading is wrong: the thighs converge, the shoes do not. Score the shoes on the floor and nothing above them.
  - Standing square, shoes level, inside the shoulders but at or outside the hips: 9. Scored 6 on review; the expert corrected it to 9. Calling this "a bit narrower than shoulder width" is the error.

STEP B IS A COMPARISON, NOT A SECOND JUDGEMENT OF THE STANCE. You can only make this deduction if you have actually SEEN the base from STEP A and can hold it next to the release. If you have one frame, or cannot identify which frame is the release, or never saw the base that was set beforehand, make NO deduction — the STEP A measurement is the score and you stop there. Never conclude that the feet collapsed from a single frame; a collapse is a CHANGE, and one frame cannot show a change.

STEP B — DID THEY HOLD IT? Look at the frame where the ball leaves the hand, and at the landing if the feet come back down before the clip ends.
  MAKE THE COMPARISON EXPLICITLY — DO NOT SKIP IT AND DO NOT ANSWER IT FROM IMPRESSION. Pick the frame that shows the base best before the release, then pick the frame where the feet are back down on the floor afterwards, and compare the gap between the shoes in those two frames against each other. Feet that were clearly separated on the way up and are clearly closer together once they are back down HAVE come apart — that is the commonest version of this fault and the main reason this step exists. Do not wave it away as the player relaxing, settling or stepping after the shot. Take the WORST of what you see across those frames and deduct accordingly — the deduction is all you are working out here, never a fresh score for the stance:
  Holding the same base they shot from, or close to it: take nothing off. This is what good looks like — they should land on the base they shot from.
  Feet noticeably closer together or wider than the base they set: take 1 off.
  Feet bunched at the release — the shoes almost touching — or a wide sideways straddle: take 2 off.
  A full collapse at the LANDING — the shoes coming down nearly touching, or one foot crossing behind the other: take 2 off. Landing on a base that has disappeared is the worst version of this fault, and 2 points is still the most it can cost.
  A small drift inward as the player extends upward is normal — take nothing off. This step is about a clear collapse or splay, not about a couple of inches.
  On a genuine high jump some narrowing in mid-air is expected; judge this at the moment of release and at touchdown, not at the peak of the flight.
  Whenever you take points off here, the reasoning must tell the player to HOLD the base through the shot and land in the stance they shot from — and must NOT tell them their stance was wrong to begin with, because it was not.

PLAYER-FACING WORDING: always say "shoulder width" — tell the player the base is too narrow, too wide, or a good shoulder-width base. NEVER write "hip width", and never mention spans, ratios or measurements in the reasoning.

NEVER SHOW YOUR WORKING TO THE PLAYER. The reasoning is read by a kid, not by a grader. The words "section", "step", "step A", "step B", "deduct", "deduction", "points off", "average", "averaging", "weighted", "score", "band", and "criterion" are all FORBIDDEN in the reasoning, along with every digit and every sum. Never write anything of the shape "before release: 3-4, after release: 7, averaging gives 5" — that is a working note, and putting it in front of a player is a failure of this criterion no matter how right the number was. Write two or three sentences the way a coach talks: what the base looked like as they went up, whether they held it through the shot, and the one thing to fix.

CONFIRM YOU CAN ACTUALLY SEE THE FEET. Before measuring, check that BOTH shoes are visible in the frames you are using — not cropped by the bottom of the frame, not hidden behind a court marking or another person, not motion-blurred into the floor. Measure only where you can see both shoes; if that is only the frames before the release, then STEP A alone gives the score and there is no deduction. Never fill in what unseen feet "must have been doing".

If the feet are never clearly visible during the shooting motion, return null. A landing you cannot see is never a reason to return null.'
WHERE name = 'Feet Shoulder Width Apart'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'STANCE RUBRIC v21%');

-- Canonical "Square to the Basket" rubric, same versioned-guard pattern as the
-- stance rubric above. Added because the criterion shipped with only its
-- one-line description, and the model read "square" off the upper body alone:
-- a player whose arms and shoulders looked clean scored high while his feet
-- were planted pointing somewhere else entirely. It also returned null when
-- the rim was out of frame, which is never necessary — foot-versus-torso
-- alignment is visible within the player's own body.
--
-- v2 fixed the opposite error. v1 read any turned foot as drift and capped it
-- at 7-8, but the open stance — a right-handed shooter whose toes point a
-- little left — is coached, correct form: it squares the hips while the
-- shooting shoulder stays behind the ball. The real fault is not the angle,
-- it is the body having to FIGHT the angle.
--
-- v3 rebalances which half of that carries the weight. v2 put feet that shift
-- during the shot in the same 3-4 band as feet turned nearly sideways, and
-- feet shift a little in almost every shot — players settle, adjust and turn
-- slightly as they gather. Small movement that changes nothing about how the
-- shot comes out is not a flaw. The severe band is now reserved for what the
-- expert actually calls bad: a player whose whole torso has to rotate to
-- shoot over a stance pointing somewhere else.
UPDATE criteria
SET grading_notes = 'SQUARE RUBRIC v3 — do the feet, hips and shoulders all aim the same way the shot is going?

YOU DO NOT NEED TO SEE THE RIM. This criterion is about whether the player''s own body agrees with itself. The feet, the hips, the shoulders and the arms should all point along the same line. When the feet point one way and the upper body points another, the player is not square — and you can see that entirely within the player, with the basket completely out of frame. Never return null because the rim is not visible, and never skip a deduction because you could not confirm where the basket is.

FEET STRAIGHT DOWN THE SHOT LINE IS THE BEST CASE. FEET A LITTLE ANGLED IS ALSO FINE. Toes turned somewhat away from the shooting-hand side — a right-handed shooter pointing a little left, a left-handed shooter pointing a little right — is a stance coaches teach on purpose: it squares the hips to the basket while the shooting shoulder stays behind the ball. So foot direction on its own is not the flaw, and neither is a small amount of foot movement during the shot.

THE FLAW IS A BODY THAT HAS TO ROTATE TO SHOOT OVER ITS OWN FEET. That is the thing this criterion is looking for: the feet planted pointing somewhere the player cannot shoot from, so the torso winds round to face the basket anyway, and the whole shot is fired across a base that is fighting it. You can see it in the set-up — the chest and shoulders twisted relative to the hips and feet — and you can see it in the recovery, the feet swinging or dragging all the way back round to get the shot off.

A LITTLE FOOT MOVEMENT IS NORMAL AND COSTS ALMOST NOTHING. Players settle, adjust and turn slightly as they gather and rise; feet shift a few degrees in most good shots. If the movement is small and the shot comes out the same either way, it is not a deduction. Only movement large enough that the player is clearly re-aiming their base mid-shot belongs anywhere below 7.

HOW TO CHECK:
  STEP 1. Find the SHOT LINE — the direction the shot is going. Read it off the upper body: where the shoulders face, and where the arms and ball are aimed.
  STEP 2. Find the FOOT LINE — the direction the toes point. Use both feet; if they disagree with each other, that is itself a fault.
  STEP 3. Score on whether the body has to work around the feet, NOT on the size of the angle between them:
    - Feet straight down the shot line, or turned off it, with the upper body relaxed and the shot coming out clean. Small settling or shifting of the feet is included here: SQUARE. Score 9-10.
    - Feet clearly moving during the shot — a visible pivot or step round as the player rises — but the shot still comes out along the shot line and the upper body is not fighting the base: 7-8.
    - The torso is visibly rotated relative to the feet at the set point: the player is shooting across their own base rather than along it: 5-6.
    - The player has to rotate their whole body to shoot: feet planted in a clearly different direction, torso wound round to face the basket, and the base having to swing back to get the shot away. Also feet close to sideways to the shot line: 3-4.

WATCH THE FEET ACROSS FRAMES, NOT IN ONE, AND ASK HOW BIG THE MOVEMENT IS. One picture of turned feet is just a stance. Compare the gather frame with the rise and the landing. A few degrees of shuffle between them is nothing. A base that has visibly swung round to a different direction is the deduction.

SQUARE DOES NOT MEAN STRAIGHT, AND IT DOES NOT MEAN STILL. Feet naturally sit at a small outward angle and naturally move a little during a shot. The bands below 7 are for a player working around their own base, not for a few degrees, one foot angled slightly out, a small adjustment on the way up, or a stance that merely looks casual.

A STAGGERED STANCE IS NOT A TURNED STANCE. The shooting-side foot being slightly AHEAD of the other is correct form and belongs to a different criterion — do not deduct here for it. What matters is the direction the toes POINT, not which foot is forward.

THE MOST COMMON ERROR IS SCORING THIS OFF THE UPPER BODY ALONE. A player whose shoulders are square to the camera and whose arms look clean reads as "square" at a glance, and that glance ignores the feet entirely. Look down at the toes every time. The opposite error is treating a turned foot or a small shuffle as the flaw: it is only a flaw when the player is working around their own base.

EXPERT CALIBRATION — real graded cases:
  - Player mid-shot with the ball at the set point, upper body and arms aimed one way, both feet clearly planted pointing a different direction, torso visibly rotated back to compensate, rim not visible in frame: score 5-6. The expert graded this 5-6. Scoring it high because the arms looked fine, or returning null because the basket was out of shot, are both the error.
  - Right-handed shooter whose toes point somewhat left of the shot line, shoulders and arms comfortably along that line, shot coming out clean: score 9-10. This is a coached open stance and there is nothing to fix. Deducting for the foot direction alone is the error.
  - The same shooter, whose feet also shift a little between the gather and the landing while the shot itself is unaffected: still 9-10. Small foot movement is not evidence of anything; dropping this to a 6 or a 7 for it is the error.

WHEN TO RETURN NULL: only when the feet are not visible at all during the shooting motion. Not being able to see the basket is never a reason.

PLAYER-FACING WORDING: when you do deduct, describe what you saw the body do — the shoulders having to twist back, or the base swinging round to get the shot away — not the angle of the feet. Never tell a player whose open stance is working that they should point their toes straight, and never make a note of a small foot adjustment. Never mention lines, angles or degrees in the reasoning.'
WHERE name = 'Square to the Basket'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'SQUARE RUBRIC v3%');

-- "Elbow L-Shape" rubric. v1 named the open-V push but scored a CATAPULTED
-- shot 8: the two-handed heave up the midline is MORE folded than an L, so
-- "recognisable L" language rewarded it (analysis 197, expert-flagged
-- 2026-08-12). v2's primary test is the two-hand hoist read at face height —
-- the midline check (ball dead-centre over the nose/head vs on the shooting
-- side) plus mirrored winged elbows, both required, with a
-- judge-normally fallback when either is unclear. Front-camera "hard to
-- confirm" hedging is banned for the hoist: it is visible from every angle.
-- Eval (harness, 5 runs): catapults 197/196 went 7→3.5-4 median, open-V 193
-- 8-9→3.5, clean control held 8-10.
-- v3 adds Joseph's taxonomy anchor: the correct set point sits around the
-- FOREHEAD on the shooting side (catapult = carried behind the head; chest
-- pass = never rises past the chest). Re-evaled: flawed clips 3.5 on every
-- run, control median 8.
-- v4 (2026-08-13): v3's hoist verdict false-fired on the COMMON pattern — a
-- one-hand shot with a flared shooting elbow whose two-handed carry looks
-- symmetric from a front camera (Joseph: "this was NOT a catapult", corrected
-- elbow to 4). The model reliably sees the symmetric-W arm-heave but CANNOT
-- reliably tell behind-the-head from in-front-of-face at production
-- resolution (verified: release-hand detail and ball-vs-crown reads both
-- flipped classifications randomly across eval rounds). v4 keeps v3's proven
-- trigger + both-findings guard, then grades the fired check into tiers:
-- pointable behind-the-head frame = catapult 1-3; clear chest-height shove =
-- 3-4; otherwise flared-elbow 4-5 with flared-elbow wording and the words
-- catapult/heave/chest-pass banned. Eval medians: scenario-3 clips 4-4.5
-- (Joseph's correction: 4), catapults 4.5 (ideal 1-3 — the price of never
-- insulting normal shooters), control 8.
--
-- v5 widens the target. v4 named ONE acceptable angle — "roughly 90" — and
-- then sent anything opened past it to 4-5, with its only V calibration
-- scored 1-3. That leaves no band for the shot most good shooters actually
-- have: a working fold somewhere around 70-90 degrees, forearm under the
-- ball, not a textbook right angle. The bend exists to load the wrist, and
-- it does that across a range. v5 states the range, scores it 7-8.5, and
-- separates the two ways the angle really fails — folded back past ~45 into
-- the catapult, or opened out until the ball leaves the top of the elbow.
UPDATE criteria
SET grading_notes = 'ELBOW RUBRIC v5 — is the arm folded into a vertical L under the ball, or is the ball being hoisted some other way?

WHAT AN L LOOKS LIKE. The forearm points straight UP toward the ceiling, the elbow points straight DOWN toward the floor, and the elbow sits directly UNDER the ball, stacked ball-over-hand-over-forearm-over-elbow. The angle at the elbow is roughly 90 degrees. The set point — where the ball loads before the release — sits around the FOREHEAD, on the shooting side. That is the whole target: forehead-height set point, one vertical forearm under the ball.

HOW EXACT DOES THE 90 HAVE TO BE? NOT VERY. The point of the bend is to load the wrist so the ball can be lifted and snapped rather than pushed, and that job is done anywhere in a broad band around a right angle. Roughly 70 to 90 degrees is a working shot: not a perfect L, close enough to one, and it still scores well. Plenty of high-level shooters live in that band — an arm folded to around 80 degrees, forearm under the ball, elbow pointing down, is a good shot and belongs in the 7-8.5 range, not in the fault bands. A textbook 90 with a vertical forearm is the 9-10.
Below that band the arm is folding too far: the forearm starts laying back toward the head instead of standing under the ball, and by the time the angle closes to around 45 degrees or less the ball is travelling back over the player rather than up. That is the catapult shape and it scores in the bottom bands — see TIER A.
This tolerance is about the ANGLE ONLY. It says nothing about an elbow winging out sideways, which is judged separately below and is not excused by a good angle.

THE TWO-HAND HOIST TEST — RUN THIS FIRST, AT FACE HEIGHT. Find the frames where the ball passes the player''s face on the way up, and answer two questions there and in every frame above:
  1. THE MIDLINE CHECK. Where is the ball relative to the head? A correct shot carries the ball up on the SHOOTING SIDE of the head — clearly off to one side of the face, above one shoulder, with one forearm under it. A hoisted shot carries the ball straight up the MIDLINE — dead-centre in line with the nose and the middle of the face, then directly over the top of the head, framed between two symmetric arms. The centred ball is the tell you can see from any distance: locate it in each rise frame and say which side of the head it is on.
  2. THE ELBOWS. Is the shooting elbow tucked under the ball pointing at the floor? Or are BOTH elbows winged out sideways, away from the body, the two arms making a matching symmetric shape either side of the ball?
A ball riding the midline with both elbows winged out at face height and above is an ARM-HEAVY SHOT. THE SHAPE CONFIRMS IT: the two upper arms lift out level to the sides, mirror images of each other, so the arms and ball read as one symmetric W with the ball at its centre — persisting frame after frame. Trust that finding; do NOT over-trust which KIND of arm-heavy shot it is. Grade it into exactly one of three tiers:
  TIER A — THE CATAPULT (score 1-3). Only when you can point at a specific frame where the ball sits level with or BEHIND the top of the head while both hands still grip it, both elbows raised up beside the ears — the soccer throw-in cock, the ball then slung forward from up there. If you can see that frame, say the ball is launched from behind the head.
  TIER B — THE TWO-HAND CHEST SHOT (score 3-4). Only when the ball clearly never loads above the chin: it is shoved out from chest height by both arms together, both elbows winged wide, like a chest pass at the rim.
  TIER C — EVERYTHING ELSE (score 4-5). No behind-the-head frame and no chest-height shove means this is a one-hand shot whose SHOOTING ELBOW IS FLARED OUT — the most common real fault. Score 4-5 and write it as exactly that: the elbow is out, the forearm off vertical — get one hand under the ball with the elbow pointing at the floor. NEVER use the words catapult, heave, sling, hoist, chest pass, or two-hand for tier C — the expert has corrected write-ups for exactly this: "this was NOT a catapult — this was just the shooting hand being flared out" (he scored that elbow a 4). When in doubt between tiers, choose the milder tier.
Do not average a fired check up above its tier because the shape looks "recognisable" — an L requires ONE forearm under the ball.
Two hands on the ball during the gather, below the chin, is completely normal and is not this fault — the test starts at face height. A ball clearly on the shooting side of the head is NOT a hoist, whatever the guide hand is doing: judge it as an ordinary L from there. And BOTH findings are required to call it: the centred ball AND the mirrored winged arms. If the ball is only slightly off-centre, or you cannot confidently say the two arms are symmetric, that is not a hoist — go back to judging the L normally under the ordinary burden of proof.

THE OPEN PUSH — THE OTHER WAY THE ANGLE FAILS. Here the elbow angle is opened up WELL past 90 degrees, so the upper arm and forearm form a wide, nearly straight line instead of a folded L. The ball ends up beside the head or out to the side rather than stacked above the elbow, and the arm is reaching or pushing rather than lifting: there is no bend left to load the wrist with. Judge this on the shape, not on a few degrees — an arm a little over 90 with the ball still stacked above the elbow is an ordinary L and scores in the 7-8.5 band. The open push is when the arm has plainly given up the bend and the ball has left the top of the elbow.

FLARED ELBOW ON THE RISE. Even with one hand properly under the ball, a shooting elbow that wings out sideways during the rise costs points: clearly out is 4-5, a brief mild drift that recovers into a true vertical L is 7-8.

SEEN FROM THE SIDE, tier A shows as the ball carried over the top of the head or dipping behind it, the forearm folded backward like a catapult arm about to sling forward — score it 1-3 per tier A. (The WRIST cocking back under the ball is correct and universal — the fault is the FOREARM leaning back, the whole ball travelling toward the head.)

HOW TO SCORE:
  - One forearm vertical under the ball, elbow pointing down, near 90 degrees, guide hand resting on the side: 9-10.
  - A working L rather than a textbook one — angle somewhere around 70 to 90 degrees, forearm close to vertical with the ball still stacked above the elbow, or the elbow a little outside the ball line, or a brief mild drift on the rise: 7-8.5. This band is not a consolation prize; it is what most good shooters actually do.
  - The arm has plainly given up the bend — opened well past 90 into an open push with the ball out beside the head — or the shooting elbow is clearly out to the side on the rise: 4-5.
  - The forearm has folded back past roughly 45 degrees, laying toward the head rather than standing under the ball: 1-3, and check TIER A.
  - A fired arm-heave check: score by its tier — behind-the-head catapult 1-3, chest-height two-hand shove 3-4, otherwise flared shooting elbow 4-5. A sideways L also scores 3-4.
  - Ball hanging behind the head, or pushed from beside the shoulder with no L at all: 1-2.

A SIDEWAYS L IS NOT AN L. An arm bent at 90 degrees but rotated so the forearm points sideways rather than up scores the same as an elbow that is completely out. Only a VERTICAL forearm counts.

JUDGE IT FROM THE RISE THROUGH THE SET POINT, before the arm extends to release. At full extension every shooter''s arm is straight — a straight arm at the apex is not a V and is not a flaw. If the only frames you have are at or after release, return null rather than scoring the extension.

CAMERA ANGLE. Filmed from the side, a single tucked elbow can look further out than it is; allow for that. But the two-hand hoist is visible from EVERY angle — mirrored hands and two winged elbows read clearly front-on, side-on and elevated — so never wave it off as a camera artifact, and never default high because the view "makes the elbow hard to confirm" when you can plainly see both hands still driving the ball. If you can see the hoist, you have seen the flaw.

EXPERT CALIBRATION — real graded cases:
  - An NBA shooter at his set point, seen from the side: ball loaded above the shooting shoulder, forearm under it, elbow pointing down, the angle at the elbow a little under a right angle — around 80 degrees rather than a textbook 90. The expert called this "not a perfect L, but close enough" and scores it 7-8.5. Marking it down to a 4 or 5 for not being exactly 90 is the error, and so is calling it a V in the reasoning.
  - Player square to the camera with the ball up beside his head, upper arm and forearm opened into a wide V, elbow out to the side rather than under the ball, pushing the shot from the side of his body: the expert said this player "did not have an L shape at all". Score it 1-3, not 5 or 6.
  - Player who carried the ball up the middle of his body with both hands mirrored on it, both elbows winged out wide, the ball riding above and behind his head before whipping out: a catapult (tier A) with no L at any point. The expert graded this a clear failure — never 7-8.
  - Player with a symmetric-looking rise, ball loading in front of his face, then a one-hand release with the shooting elbow flared and the guide hand hanging close: tier C — the expert scored this elbow a 4 and corrected the write-up: "this was NOT a catapult — this was just the shooting hand being flared out."

PLAYER-FACING WORDING: tell them the shooting hand has to take the ball at face height with the elbow tucked under it — one flat vertical forearm carrying the ball, the other hand just along for the ride — instead of heaving the ball up with both hands. Never mention degrees or angles in the reasoning.'
WHERE name = 'Elbow L-Shape — Under the Ball'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'ELBOW RUBRIC v5%');

-- "Source of Shot Power" rubric. v1 read power off legs + elbow angle but had
-- no shape for the catapult, so a catapulted shot scored 8 off its knee bend
-- (analysis 197, expert-flagged 2026-08-12). v2 keeps the leg test and names
-- three arm-powered patterns that each cap the score on their own: the
-- two-hand hoist/catapult (midline check + mirrored winged arms, cap 4), the
-- open-V push (cap 4), and the chest pass (cap 2), plus a flared-elbow-on-
-- the-rise cap of 6. Same eval as the elbow rubric: catapults 6.5-8→3.5-4,
-- clean control held 8-10.
-- v3 anchors the correct set point around the FOREHEAD: launched from the
-- chest (chest pass, elbows out) or carried past it behind the head
-- (catapult) both mean the arms threw it. Re-evaled: flawed clips 3.5 on
-- every run, control median 8.
-- v4 (2026-08-13): same tiered arm-heave grading as ELBOW RUBRIC v4 (see its
-- comment). Tier C (one-hand shot, arms adding push) scores 5-6 per Joseph's
-- correction template ("guide hand is doing some work... should all come from
-- your legs" — he scored it 6). Eval medians: scenario-3 clips 5 (target 6),
-- catapults 5.5 (ideal <=4), control 8.
UPDATE criteria
SET grading_notes = 'POWER RUBRIC v4 — is the shot driven by the legs, or thrown by the arms?

READ THIS OFF TWO THINGS: the legs, and HOW THE BALL IS CARRIED UP. Check both every time — never score this criterion off the legs alone. Bent knees the player never drives through put no power into the ball, and a deep knee bend never excuses arms that are doing the throwing.

THE LEG TEST. Look for a real dip and a real drive: knees bent in the gather, then visibly extending as the ball goes up, the whole body rising as one motion. A player who stays upright, or who dips and then shoots without ever extending the legs, is not getting power from the ground.

THE ARM TEST — RUN IT AT FACE HEIGHT. In a leg-powered shot, by the time the ball passes the face ONE hand has taken it — shooting hand under the ball, forearm folded toward vertical, elbow under it — and the ball loads at a set point around the FOREHEAD on the shooting side, riding the leg drive up through that stacked arm. A ball that never gets to the forehead (launched from the chest) or that keeps going past it (carried behind the head) was thrown by the arms. Look at the frames from face height to the set point and ask what the arms are doing. Each of these patterns proves the arms supplied the force, and each caps this criterion on its own no matter how good the knee bend looks:
  - THE ARM-HEAVE CHECK. Run the midline check: locate the ball against the head in each rise frame. A correct shot carries the ball up on the SHOOTING SIDE of the head; an arm-heavy shot carries it straight up the MIDLINE — dead-centre over the nose, framed between two symmetric winged-out arms so the arms and ball read as one symmetric W, persisting frame after frame. BOTH findings are required: the centred ball AND the mirrored winged arms. A ball clearly on the shooting side of the head is not a heave, and a ball only slightly off-centre without confidently symmetric arms is not one either — judge the arm normally from there. When the check DOES fire, trust that the arms are doing too much — but do NOT over-trust which kind of arm-heavy shot it is. Grade it into one of three tiers:
      TIER A — THE CATAPULT (cap at 4, no matter how deep the knee bend). Only when you can point at a specific frame where the ball sits level with or BEHIND the top of the head while both hands still grip it, both elbows up beside the ears, before being slung forward.
      TIER B — THE TWO-HAND CHEST SHOT (cap at 2 with static legs, 3-4 with a real knee bend). Only when the ball clearly never loads above the chin and is shoved from chest height by both arms together.
      TIER C — EVERYTHING ELSE (score 5-6 with a real dip and drive, 4-5 when the dip is shallow too). No behind-the-head frame and no chest-height shove means a one-hand shot where the arms add more push than they should — a flared elbow lifting the ball, or the guide hand still on it contributing force. The expert''s template for this case: he scored it 6 with "the guide hand is doing some work on the ball, which adds power. it should all come from your legs." Write it that way — let the legs do the work. NEVER use the words catapult, heave, sling, hoist, chest pass, or two-hand for tier C. When in doubt between tiers, choose the milder tier.
  - THE OPEN-V PUSH. The elbow opens well past 90 on the way up, the arm reaching and extending at the ball rather than folded and lifting. The hands are pushing. Cap at 4.
  - THE CHEST PASS. Both hands mirrored on the sides of the ball, both elbows winged out, ball shoved straight out from chest height by the two arms together — it never rises to a forehead set point at all. Cap at 2.
Two hands on the ball during the gather, below the chin, is completely normal and none of these — the arm test starts where the ball passes the face.

FLARED ELBOW ON THE RISE. Even with one hand properly under the ball, a shooting elbow drifting out sideways on the way up means the arm is lifting rather than riding: cap at 6 even when the set point tidies up afterwards.

HOW TO SCORE:
  - Clear knee bend driving into full extension, one hand under the ball by face height, folded vertical forearm riding that drive: 9-10.
  - Legs contributing but the arm doing more than it should, or a shallow dip, or the elbow drifting out on the rise: 6-7.
  - A fired arm-heave check at tier A or B, an open-V push, or almost no leg drive: 3-4 (tier C scores 4-6 per its band above).
  - Ball shoved entirely by the arms — chest-passed or two-hand slung with the legs static: 1-2.

DO NOT CONFUSE FULL EXTENSION AT RELEASE WITH ANY OF THESE. Every shooter''s arm straightens as the ball leaves the hand — that is the finish of a good shot, not an arm push. And both arms finishing high is normal. Judge the arms between face height and the set point, before the extension.

THE ARM-HEAVE W IS VISIBLE FROM EVERY ANGLE. Mirrored hands and two winged elbows read clearly front-on, side-on and elevated. Never default high because the camera "makes it hard to confirm" — if you can see the persistent W, you have seen that the arms are doing too much; only the TIER needs its own specific evidence.

IF THE ONLY FRAMES YOU HAVE ARE AT OR AFTER THE RELEASE, the evidence for this criterion is not present — you cannot see the gather, the knee bend, or the set point, and legs already extended at release tell you nothing about whether they drove the shot. Return null rather than scoring a shot you never saw loaded.

PLAYER-FACING WORDING: tell them to load their legs and let the ball ride up through one folded, vertical arm — the shooting hand taking the ball at face height — instead of heaving or catapulting it with both hands. Calling it "catapulting the ball" is good coaching language. Never mention degrees or angles in the reasoning.'
WHERE name = 'Source of Shot Power'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'POWER RUBRIC v4%');

-- "Guide Hand Follow Through" rubric. v1 named the flick, the hands closing up
-- and a thrashing finish, but "flat" was left as an impression and the model read
-- an extended hand with the fingers spread wide as "flat and open" — a real clip
-- of a guide hand riding up overhead with the fingers splayed scored 10/10/10.
-- v2 makes flatness a thing you look AT (the gaps between the fingers: together
-- is flat, spread is not) and adds a stay-put test that tracks the hand across
-- the finish frames, so sideways travel and riding up with the shot are faults
-- of their own rather than variations on the flick.
-- v3, from expert review with a photographed anchor: BOTH ARMS FINISHING HIGH
-- IS NOT A FAULT. v2 scored "rides up overhead alongside the shooting hand"
-- 4-5 outright, which fails the expert's own good example — a front-on finish
-- with both arms extended overhead, hands clearly apart, guide hand flat and
-- peeling. The fault was never the height of the guide arm; it is the hand
-- CONVERGING, pushing or flicking. v3 rescopes the upward-drive fault to
-- convergence-while-rising and adds the anchor. Also check every finish frame,
-- frame by frame — the peel is a motion, not a pose.
UPDATE criteria
SET grading_notes = 'GUIDE HAND FOLLOW THROUGH RUBRIC v3 — did the shot go THROUGH a flat, still guide hand that stayed clear of the shooting hand?

WHAT GOOD LOOKS LIKE. At the finish the two hands are clearly APART and never touch. The guide hand is FLAT — fingers TOGETHER and extended, the hand reading like one flat board or paddle. The thumb is passive and flat against the hand, not flicking or pushing. And the hand STAYS WHERE IT WAS: the ball is shot THROUGH it, so it holds its position and PEELS away without adding anything. A guide hand that finishes flat, still and separated is 9-10.
  THE GUIDE ARM FINISHING HIGH IS FINE. Plenty of correct shooters finish with BOTH arms extended upward. That is not a fault and never costs points on its own — expert-graded anchor: a front-on finish with both arms extended overhead, the hands clearly apart, the guide hand flat with its fingers together, peeling with no flick, is a 9-10. The height of the guide arm tells you nothing; what you are checking is whether the hand STAYED CLEAR, STAYED FLAT and STAYED PASSIVE on its way there.
  WORK FRAME BY FRAME. The peel is a motion, not a pose — step through every frame from the release to the finish and watch what the guide hand actually does in each one. A single tidy finish frame proves nothing about the frames before it.

THE FLATNESS TEST — LOOK AT THE GAPS BETWEEN THE FINGERS. This is a specific thing to look at, not an impression. A flat hand has its fingers touching or nearly touching, so the hand reads as ONE surface. Clear gaps between the fingers, fingers spread open like a starfish, fingers curled into a cup or claw, or a fist, are all NOT flat — score 4-5. Do not call a hand "flat and open" because it is extended: an extended hand with the fingers spread apart is a spread hand, and spread is the fault.

THE STAY-PUT TEST — TRACK THE GUIDE HAND ACROSS THE FRAMES. Note where the guide hand is in the frame where the ball leaves the shooting hand, then find it again in each of the next two or three frames. A correct guide hand barely moves. Score the largest movement you can see:
  - Holds its position, peels away cleanly, or rises with the shot while staying clearly APART from the shooting hand, flat and passive: 9-10.
  - Slides SIDEWAYS — in toward the shooting hand, or out away from the body — by roughly its own width or more: 4-5. Side-to-side motion in the guide hand means it was steering, not riding along.
  - CONVERGES while rising — the gap between the two hands closing as they go up, the guide hand chasing the ball or its palm turning to push it: 4-5. Rising is fine; closing the gap is the fault.
  - Snaps or flicks — a fast lateral jab, or the thumb kicking at the ball: 3-4.

FAULT — THE HANDS COME TOO CLOSE. If at ANY point from the release onward the guide hand drifts in toward the shooting hand — the two closing up, meeting, touching or crossing — that is a real flaw. Check every frame of the release and finish, not just the last one. Hands ending up together is a 3-4, and touching or crossing is 1-2.

FAULT — A FLIMSY, THRASHING FINISH. If the hands or the elbows are in noticeably different places from one frame to the next, flying around rather than holding a position, the finish is not controlled. A good follow-through is STILL: the arms hold their shape after the ball is gone. Hands and elbows that jump around frame to frame, with no held finish, score 3-4 even if no single frame looks terrible on its own. Judge this across the sequence, not from one image.

CAMERA ANGLE COMPRESSES SEPARATION. Filmed from the front the two hands can look closer together than they are. What matters is whether they actually TOUCH or converge. Hands that look a little close from that angle but plainly keep a gap between them are correct — do not deduct for the angle alone.

NEVER DEDUCT FOR SOMETHING YOU CANNOT SEE. Do not shave points because the finish could have been "held a beat longer" or the hand could have been "a little flatter" — that is coaching advice, not an observed flaw. If the hands are apart, the fingers are together, the thumb is passive and the hand held still, the score is 9-10. Reserve everything below that for a fault you can actually point at in a frame.

BUT THE HAND ITSELF IS DIRECTLY VISIBLE, SO NEVER DEFAULT TO A HIGH SCORE ON IT. Spread fingers, a cupped palm, a driving thumb, and a hand that travels between frames are all things you can see and name. The general burden-of-proof and default-to-10 rules do NOT soften this criterion, and a clean release, a good arc or a ball that goes in tells you nothing about what the guide hand did.

HOW TO SCORE:
  - Hands clearly apart, fingers together and flat, thumb passive, hand still or peeling cleanly — whether the guide arm finishes low or high: 9-10.
  - Correct but slightly imperfect — the hand a touch angled, or a small settle after the finish: 7-8.
  - Guide hand spread, cupped or curled; or it slides sideways; or the gap between the hands closes as they rise: 4-5.
  - Hands closing up together at the finish, a thumb flick, or hands and elbows thrashing between frames: 3-4.
  - Hands actually touching or crossing: 1-2.

DO NOT PENALISE THE ARMS COMING DOWN. After the ball is gone it is normal for both arms to lower and separate as the player returns to rest. That is not a flaw and is not thrashing. Only the frames at and just after release count.

PLAYER-FACING WORDING: tell them to keep the guide hand flat like a board with the fingers together, thumb relaxed, and let the ball go straight through it — the hand peeling away cleanly instead of sliding around or pushing, and the hands finishing apart. Never mention frames or scoring bands in the reasoning.'
WHERE name = 'Guide Hand Follow Through'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'GUIDE HAND FOLLOW THROUGH RUBRIC v3%');

-- "Shooting Hand Follow Through" rubric. The criterion shipped with only its
-- one-line description, so it inherited nothing but the global default-to-10
-- rule and scored 10 on almost every shot — including clips where the hand
-- plainly drifted in toward the middle of the body after release. The fault it
-- never had language for is the cross-body finish: the hand carried past the
-- midline instead of reaching straight down the line at the rim. The midline
-- test makes that a placement you locate in the frame rather than an
-- impression of whether the finish looked tidy.
-- v2, from expert review: names the "hand in the cookie jar" finish as the
-- target shape (wrist snapped, fingers hanging — like reaching over the rim
-- into a jar), makes stillness a consequence of a LOADED wrist (the snap is
-- the only motion; a travelling arm means the arm did the throwing), and adds
-- a photographed anchor of that finish.
UPDATE criteria
SET grading_notes = 'SHOOTING HAND FOLLOW THROUGH RUBRIC v2 — did the shooting hand finish reaching STRAIGHT at the basket, on its own side of the body, with the wrist snapped down?

WHEN TO JUDGE IT. Start at the frame where the ball leaves the fingers and use the next two or three frames — the finish. Do not judge this from the set point, and do not judge it from late frames where the arms are already back down by the waist.

WHAT GOOD LOOKS LIKE — THE HAND IN THE COOKIE JAR. The arm finishes extended up and out toward the basket. The wrist has snapped DOWN so the fingers hang over and point down the line of the shot at the rim, palm toward the floor — the "goose neck", like reaching over the rim of a tall cookie jar and dropping the hand in. The hand stays on the shooting side of the body. And it is STILL: because the wrist was LOADED before the shot, the snap is the ONLY motion in the finish — the arm reaches its spot and holds that shape while the ball is in the air. Expert-graded anchor: a front-on finish frame, arm extended high on its own side, wrist snapped so the hand hangs relaxed toward the floor, holding there — 9-10.

THE ARM BARELY MOVES AFTER RELEASE. Watch the arm itself across the finish frames, separately from the wrist. A correct follow-through has the arm arriving and STOPPING; the wrist snap happens at the end of a still arm. An arm that keeps travelling after the ball is gone — sweeping across, pumping down, whipping back — was throwing the ball instead of releasing it: score 5-6 even when the final pose looks tidy, and lower if the travel crosses the midline (the bands below).

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

PLAYER-FACING WORDING: tell them to finish with the hand reaching straight at the rim on their own side of their body, snap the wrist down like dropping their hand into a cookie jar, and hold it there — the "hand in the cookie jar" cue is good coaching language to use. Never mention midlines, frames or scoring bands in the reasoning.'
WHERE name = 'Shooting Hand Follow Through'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'SHOOTING HAND FOLLOW THROUGH RUBRIC v2%');

-- Free first analysis: every NEW account gets one upload on the house, but its
-- report shows only the overall score — the criteria breakdown stays blurred
-- until the account holds a purchased token (the results page then flips
-- is_free_preview off permanently). users.free_analysis_used defaults TRUE so
-- existing accounts are not retroactively granted the freebie; the signup
-- route inserts FALSE explicitly for accounts created after this ships.
ALTER TABLE users ADD COLUMN IF NOT EXISTS free_analysis_used BOOLEAN DEFAULT true;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS is_free_preview BOOLEAN DEFAULT false;




