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
INSERT INTO criteria (name, description, grading_notes, weight, order_index)
SELECT
  'Feet Shoulder Width Apart',
  'Feet are set approximately shoulder width apart, creating a stable base for balance, power transfer, and a connected shot',
  'Stance width — assess during the SETUP frames, before the player rises into the shot. INTERNAL MEASUREMENT IS HIP WIDTH: correct, efficient stance places the feet approximately hip width apart, heels roughly under the hip joints. That is narrower than the shoulders. The criterion is NAMED "shoulder width apart" because that is the cue coaches give players and it produces the right result — but when you look at the frames, judge the stance against HIP width. LOOK FOR: feet planted about hip width apart, a balanced base with the knees free to bend straight out over the feet. Small deviations either side of exact hip width are normal and score 9-10 when the player looks balanced. DEDUCT FOR EITHER EXTREME — both are real flaws: (a) TOO WIDE — feet noticeably beyond hip width, out toward or past the outside of the shoulders, which flattens the base, blocks the knees from bending over the feet, and leaks leg drive; (b) TOO NARROW — feet inside hip width, ankles close together, an unstable base with no lateral balance. Only deduct when the flaw is clearly visible; if the stance looks about hip width and balanced, score 10. PLAYER-FACING WORDING: in your reasoning, always describe this to the player as "shoulder width" — say the stance is too wide, too narrow, or a good shoulder-width base. NEVER write "hip width" in the reasoning text; hip width is the internal measurement only. If the feet are never clearly visible in the setup frames, return null.',
  1.0,
  (SELECT COALESCE(MIN(order_index), 2) - 1 FROM criteria)
WHERE NOT EXISTS (SELECT 1 FROM criteria WHERE name = 'Feet Shoulder Width Apart');

-- Retarget the stance rubric from shoulder width to hip width. The criterion
-- name and player-facing description intentionally keep saying "shoulder
-- width" (the coaching cue); only the internal grading measurement changes.
-- Guarded on the original text so it applies once and never overwrites later
-- edits. Also fills in a fresh-DB seed, where grading_notes starts NULL.
UPDATE criteria
SET grading_notes = 'Stance width — assess during the SETUP frames, before the player rises into the shot. INTERNAL MEASUREMENT IS HIP WIDTH: correct, efficient stance places the feet approximately hip width apart, heels roughly under the hip joints. That is narrower than the shoulders. The criterion is NAMED "shoulder width apart" because that is the cue coaches give players and it produces the right result — but when you look at the frames, judge the stance against HIP width. LOOK FOR: feet planted about hip width apart, a balanced base with the knees free to bend straight out over the feet. Small deviations either side of exact hip width are normal and score 9-10 when the player looks balanced. DEDUCT FOR EITHER EXTREME — both are real flaws: (a) TOO WIDE — feet noticeably beyond hip width, out toward or past the outside of the shoulders, which flattens the base, blocks the knees from bending over the feet, and leaks leg drive; (b) TOO NARROW — feet inside hip width, ankles close together, an unstable base with no lateral balance. Only deduct when the flaw is clearly visible; if the stance looks about hip width and balanced, score 10. PLAYER-FACING WORDING: in your reasoning, always describe this to the player as "shoulder width" — say the stance is too wide, too narrow, or a good shoulder-width base. NEVER write "hip width" in the reasoning text; hip width is the internal measurement only. If the feet are never clearly visible in the setup frames, return null.'
WHERE name = 'Feet Shoulder Width Apart'
  AND (grading_notes IS NULL OR grading_notes LIKE 'Assess stance width during the SETUP frames%');
