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
SET grading_notes = 'STANCE RUBRIC v10 — how wide is the player''s base at the moment they shoot?

WHICH MOMENT TO MEASURE. The window opens when the player starts driving upward into the shot and closes on the LAST frame where both feet are still touching the floor — that is, as they go up and at the top of the lift, before the ball is released and before the feet leave the ground. Measure inside that window and nowhere else.
  Ignore everything before the window. Players stand with their feet together while waiting and step out into their base as they load, so a narrow reading taken before the shot starts is not a finding.
  But if the feet are STILL close together inside the window, that IS the finding — never excuse it by assuming they were about to step out.
  If the feet shift during the window, use the widest set position they hold while both feet are still down.
  Once the feet leave the floor, stop. Feet coming together in the air is normal and is never a deduction.
  A good base has a decent amount of daylight between the feet — a clearly separated, roughly shoulder-width stance held all the way up to takeoff. Both failures are real and score the same: too close together is bad, and too far apart is bad.

THE MEASUREMENT — THE CORRIDOR TEST. Never judge the base by general impression; your first impression is usually wrong, and it is wrong in the generous direction far more often than not. On a frame where the player is square to the camera:
  STEP 1. Find four points: the outer edge of each HIP, and the outer edge of each SHOULDER. If the arms are overhead, take the shoulder points at the widest part of the torso at the deltoids.
  STEP 2. Drop a vertical plumb line to the floor from all four. On each side this gives an inner line from the hip and an outer line from the shoulder; the space between them is that side CORRIDOR.
  STEP 3. See where the OUTER edge of each shoe lands:
    - Inside its corridor, or on either line: CORRECT. Score 9-10.
    - A little short of the hip line, or a little past the shoulder line: 7-8.
    - Clearly INSIDE the hip line, bunched toward the centre: TOO NARROW. Score 3-4, and 3 when the shoes are nearly touching.
    - Clearly OUTSIDE the shoulder line: TOO WIDE. Score 3-4.

THE CORRIDOR IS WIDE ON PURPOSE, AT BOTH ENDS. A base at hip width and a base at shoulder width are equally correct and both score 9-10 — never mark a player down for sitting at the hip end, and never write that a hip-width base is "a bit narrow" or "could be wider". Equally, never let that generosity cover a shoe that is outside its corridor: past the shoulder line or bunched inside the hip line is 3-4 no matter how athletic or tidy the rest of the shot looks.

BEFORE YOU SCORE 3-4 FOR A NARROW BASE, CONFIRM THE SHOES ARE ACTUALLY BUNCHED. The 3-4 narrow band is for feet with almost no daylight between them — ankles close, the two legs reading as one column. If there is a clear gap between the inner edges of the shoes, one you could fit a shoe into, the base is NOT in that band: it is 9-10 if the shoes are inside their corridors and at worst 7-8 if they fall a little short of the hip lines. Being strict about bunched feet does not mean doubting a base that plainly has room in it.

WHEN THE PLAYER IS SMALL IN THE FRAME the hip and shoulder edges are too soft to place accurately and the plumb lines will mislead you — usually into a generous score. Fall back on the daylight between the shoes: a correct base has a clear gap between the inner edges roughly as wide as one shoe or more. Shoes nearly touching with almost no daylight is 3-4, whatever the plumb lines seemed to say.

THIS CRITERION IS DIRECTLY MEASURABLE, SO NEVER DEFAULT TO A HIGH SCORE. Whenever the feet and shoulders are both visible you can compare the two spans, which makes a bad base a specific, clearly visible flaw. The general burden-of-proof and default-to-10 rules do NOT soften this criterion. Judge the feet and nothing else: a square torso, a clean rise, good balance and a tidy upper body tell you nothing about the base and must never pull a narrow or wide stance back up toward 9.

THE TWO WAYS THIS GETS GRADED WRONG, BOTH OF THEM GENEROUS:
  1. A NARROW BASE UNDER A TIDY SHOOTING POSE. A player standing tall and square with the ball up at the set point looks like textbook form at a glance, and that glance says the stance is fine when the feet are actually close together. It is not fine — it is a 3-4. This is easiest to miss when the player is far from the camera and small in the frame. When that happens, look harder at the feet; do not fall back on overall impression.
  2. A WIDE BASE UNDER A LOADED CROUCH. Knees bent and hips back reads as "athletic" and "stable" even when the shoes are far outside the shoulder line. That impression is wrong. A foot span half again the shoulder span is a 3-4, not a 9.

EXPERT CALIBRATION — five real graded cases:
  - Distant, small in frame, square, ball at the set point, feet almost touching with barely any daylight between the shoes: 3. Repeat runs scored this 8, 9, 9 and 4 before the expert set it at 3.
  - Standing tall mid-shot, arms extended overhead, shoes a few inches apart and well inside the shoulders: 4. Scored 8 then 9 on review; the expert corrected it to 4 both times.
  - Crouched with the ball low, thighs splayed, shoes clearly outside the shoulders: 4. Scored 9; the expert corrected it to 4.
  - Squared up in the gather, knees bent, ball at chest, shoes set at roughly shoulder width: 9. Scored 4 because an earlier standing frame was measured instead of the gather.
  - Standing square, shoes level, inside the shoulders but at or outside the hips: 9. Scored 6 on review; the expert corrected it to 9. Calling this "a bit narrower than shoulder width" is the error.

THE LANDING. If the player jumps AND you can clearly see both feet back on the floor afterward, they should land in the same base they shot from. Landing clearly narrower or wider costs 1 point, or 2 when it is drastic (feet nearly touching, or a wide straddle). Never more than 2, never below 6 on this alone, and never stacked on a base already scored 3-4. Skip this entirely for set shots, clips that end mid-air, or feet not visible at touchdown — never guess at a landing you cannot see. Feet coming together IN THE AIR is normal and is never a deduction. When you do deduct, say it is the landing and tell them to land in the stance they shot from.

PLAYER-FACING WORDING: always say "shoulder width" — tell the player the base is too narrow, too wide, or a good shoulder-width base. NEVER write "hip width", and never mention spans, ratios or measurements in the reasoning.

If the feet are never clearly visible during the shooting motion, return null. A landing you cannot see is never a reason to return null.'
WHERE name = 'Feet Shoulder Width Apart'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'STANCE RUBRIC v10%');

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

