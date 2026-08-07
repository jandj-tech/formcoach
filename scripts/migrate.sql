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
-- v3 adds explicit score bands. v2 described both extremes as flaws but never
-- said how far to deduct, so the model read a visibly pinched stance as a
-- "minor issue" and scored it 8 when the expert wanted 4.
UPDATE criteria
SET grading_notes = 'STANCE RUBRIC v7 — assess feet width at the START OF THE SHOOTING MOTION, not in the earliest frames.

WHICH FRAME TO MEASURE — DO THIS FIRST, BEFORE MEASURING ANYTHING. Getting the frame wrong is the single biggest cause of a wrong score on this criterion.
  Scan the frames in order and find the moment the shot actually begins: the player has the ball under control, has dipped into the knee bend, and is starting to rise. Measure the stance THERE — from the gather through the start of the upward drive. That is the base the player shoots from, and it is the only base that matters.
  IGNORE every frame before that: standing idle, catching or receiving a pass, dribbling, walking or turning into position, resetting the feet. Players routinely stand with their feet close together while waiting and then STEP OUT into their base as they load into the shot. Measuring one of those earlier frames and calling the stance narrow is a grading error, not a finding.
  If the feet are close early and correctly set by the time the player rises, the stance is CORRECT — score it on the rise. Feet that were narrow a moment before the shot are not a flaw.
  If the feet move during the shot, use the widest set position between the gather and the moment the feet leave the floor.
  Once the player leaves the floor, stop measuring — the feet coming together in the air is normal and is never a deduction.

HOW TO MEASURE — THE CORRIDOR TEST. Never judge stance width by general impression; your first impression on this criterion is usually wrong. Run this exact procedure on a shooting-motion frame where the player is square to the camera:
  STEP 1. Find four points: the outer edge of each HIP, and the outer edge of each SHOULDER. If the arms are raised overhead, take the shoulder points at the widest part of the torso at the deltoids.
  STEP 2. Mentally drop a vertical plumb line straight down to the floor from all four points. On each side of the body this gives an inner line (from the hip) and an outer line (from the shoulder). The space between them is that side CORRIDOR.
  STEP 3. Look at where the OUTER edge of each shoe lands.
  STEP 4. Score from what you see:
    - Each shoe lands anywhere INSIDE ITS CORRIDOR, or on either line: CORRECT. Score 9-10.
    - Each shoe lands a little short of the hip line, or a little past the shoulder line: 7-8.
    - Shoes are clearly INSIDE the hip lines, bunched in toward the centre of the body: TOO NARROW. Score 3-4.
    - Shoes are clearly OUTSIDE the shoulder lines: TOO WIDE. Score 3-4.

THE CORRIDOR IS WIDE ON PURPOSE. A stance at hip width and a stance at shoulder width are BOTH fully correct and both score 9-10. Never mark a player down for sitting at the narrow end of the corridor — do not write that a hip-width stance is "a bit narrow" or "could be wider". Only go below 9 when a shoe is outside its corridor entirely.

Convert to a ratio if it helps: shoe span divided by shoulder span. The same bands expressed that way:
- 0.70 to 1.15 — CORRECT. Score 9-10. The feet sit between hip width and shoulder width. Anywhere in this band is good form; do not nitpick a player who is inside it.
- 0.55 to 0.70, or 1.15 to 1.30 — slightly off but still stable. Score 7-8. Name the specific deviation.
- 0.40 to 0.55, or 1.30 to 1.50 — clearly off. Score 5-6.
- Below 0.40, or above 1.50 — OBVIOUSLY WRONG. Score 3-4.
- Feet touching, or so wide the player cannot rise straight up. Score 1-2.

THE MOST COMMON GRADING ERROR IS MISSING A TOO-WIDE STANCE. A player in a loaded, knees-bent, hips-back posture reads as "athletic", "stable" and "balanced" even when the shoes are far outside the shoulder line. That impression is wrong. If the outer edges of the shoes are clearly OUTSIDE the outer edges of the shoulders, the stance is too wide no matter how balanced it looks — a shoe span half again the shoulder span is a 3-4, not a 9. Check the shoes against the shoulder line every single time, especially when the player is crouched or the ball is low.

THE SECOND MOST COMMON ERROR IS SCORING A NARROW STANCE OFF A PRE-SHOT FRAME. Before you deduct for a narrow base, confirm the frame you measured is one where the player is actually loading and rising into the shot. If the only narrow frames are before the shot begins and the feet are set correctly once the player rises, the score is 9-10 and there is no flaw to report.

THE THIRD MOST COMMON ERROR IS MISSING A NARROW STANCE IN AN OTHERWISE TIDY SHOOTING POSE. A player standing tall and square, arms up in a clean shooting motion, looks like textbook form at a glance — and that glance will tell you the stance is fine when the feet are actually close together. It is not fine. Ignore the upper body entirely and look only at where the shoes sit against the plumb lines. Feet a few inches apart with the ankles nearly touching, legs reading as a single column, is a 3-4 — not a 6, not a 9. This is especially easy to miss when the player is far from the camera and small in the frame; when that happens, look harder at the feet rather than falling back on the overall impression.

THIS CRITERION IS DIRECTLY MEASURABLE, SO DO NOT DEFAULT TO A HIGH SCORE. Whenever both feet and both shoulders are visible you can measure the ratio, which makes a bad stance a specific, clearly visible flaw. The general burden-of-proof and default-to-10 rules do NOT soften this criterion.

EXPERT CALIBRATION EXAMPLES — all four are real graded cases:
- Player squared to the camera in the gather, knees bent, ball at chest height, rising into the shot, shoes set at roughly shoulder width with the toes level: score 9-10. This was scored 4, and the expert corrected it to 9 or better. The model measured an earlier frame where the player was still standing with the feet close together before stepping out into the base. Measuring the wrong frame is the entire error — the shooting stance itself was correct.
- Player standing tall mid-shot, arms extended overhead, shoes only a few inches apart and well inside both plumb lines (ratio around 0.3): score 4. This was scored 8 and then 9 on review, and the expert corrected it to 4 both times. The clean upper body is what causes the mistake. Note the difference from the case above: here the feet are still narrow DURING the shooting motion, so the narrow reading is real.
- Player crouched with the ball low, thighs splayed, shoes clearly outside both plumb lines (ratio around 1.6): score 4. This was scored 9, and the expert corrected it to 4. The loaded posture is what causes the mistake.
- Player standing square with the shoes level, inside the shoulder lines but at or outside the hip lines (ratio around 0.8-0.9): score 9. This was scored 6 on review and the expert corrected it to 9. It is the target, and calling it "a bit narrower than shoulder width" is the error — a shoe anywhere in the corridor is correct.

BOTH EXTREMES COUNT EQUALLY. Too wide is exactly as much a flaw as too narrow. Past the shoulder line it blocks the knee bend and leaks leg drive sideways.

PLAYER-FACING WORDING: always say "shoulder width" — tell the player the stance is too narrow, too wide, or a good shoulder-width base. NEVER write "hip width", and never mention ratios or measurements in the reasoning.

If the feet are never clearly visible in any frame of the shooting motion, return null.'
WHERE name = 'Feet Shoulder Width Apart'
  AND (grading_notes IS NULL OR grading_notes NOT LIKE 'STANCE RUBRIC v7%');
