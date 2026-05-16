CREATE TABLE IF NOT EXISTS pending_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name_initial CHAR(1),
  invite_token VARCHAR(100) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
