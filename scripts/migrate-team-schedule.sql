-- Team schedule: coach-created events with one-tap player RSVP.
-- Run: psql $DATABASE_URL -f scripts/migrate-team-schedule.sql

CREATE TABLE IF NOT EXISTS team_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  type VARCHAR(10) NOT NULL DEFAULT 'practice',       -- 'practice' | 'game' | 'other'
  title VARCHAR(120),                                  -- optional: "vs Raptors", "Team BBQ"
  location VARCHAR(200),
  notes VARCHAR(500),
  starts_at TIMESTAMPTZ NOT NULL,
  time_tbd BOOLEAN NOT NULL DEFAULT FALSE,             -- date fixed, time not announced yet
  status VARCHAR(10) NOT NULL DEFAULT 'active',        -- 'active' | 'cancelled'
  created_by_email VARCHAR(255) NOT NULL,              -- audit: which coach/org session created it
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_events_team_starts
  ON team_events (team_id, starts_at);

-- One row per (event, player). Status flips update the row (UPSERT).
CREATE TABLE IF NOT EXISTS team_event_rsvps (
  event_id UUID NOT NULL REFERENCES team_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(5) NOT NULL,                          -- 'in' | 'out'
  note VARCHAR(140),                                   -- "leaving early", profanity-filtered
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);
