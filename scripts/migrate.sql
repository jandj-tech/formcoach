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
  'Assess stance width during the SETUP frames, before the player rises into the shot. LOOK FOR: feet planted approximately shoulder width apart — a stable, balanced base roughly under the shoulders. Slightly wider or narrower than exact shoulder width is normal and scores 9-10 as long as the player looks balanced. AVOID / DEDUCT FOR: feet clearly too narrow (inside hip width, ankles nearly together, unstable base) or excessively wide (well beyond the shoulders, restricting the knees and leg drive). Only deduct when the stance-width flaw is clearly visible; if the stance looks roughly shoulder width and balanced, score 10. If the feet are never clearly visible in the setup frames, return null.',
  1.0,
  (SELECT COALESCE(MIN(order_index), 2) - 1 FROM criteria)
WHERE NOT EXISTS (SELECT 1 FROM criteria WHERE name = 'Feet Shoulder Width Apart');
