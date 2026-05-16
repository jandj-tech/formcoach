-- Team plan schema additions
-- Run: psql $DATABASE_URL -f scripts/migrate-teams.sql

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  admin_email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  access_code VARCHAR(20) UNIQUE NOT NULL,
  credits INTEGER DEFAULT 0,
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name_initial CHAR(1) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(team_id, first_name, last_name_initial)
);

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS team_player_id UUID REFERENCES team_players(id);

-- Additional coaches for a team (beyond the founding coach in teams.admin_email).
CREATE TABLE IF NOT EXISTS team_coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  invite_token VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Coach display names, so players and orgs can tell who the coach is.
ALTER TABLE team_coaches ADD COLUMN IF NOT EXISTS nickname VARCHAR(100);
ALTER TABLE teams ADD COLUMN IF NOT EXISTS coach_nickname VARCHAR(100);
