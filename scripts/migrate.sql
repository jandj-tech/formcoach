-- LearnHoops database schema

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

-- Seed custom criteria (only if table is empty)
INSERT INTO criteria (name, description, weight, order_index)
SELECT * FROM (VALUES
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
