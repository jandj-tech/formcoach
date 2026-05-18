CREATE TABLE IF NOT EXISTS org_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name VARCHAR(200) NOT NULL,
  email VARCHAR(200) NOT NULL,
  player_count INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  signup_token VARCHAR(36) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ
);
