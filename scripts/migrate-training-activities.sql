-- Manual training log: players record roughly how much time they spent on
-- shooting/form work vs. other basketball activity. Feeds the consistency
-- dashboard (streaks, active weeks, consistency score) alongside completed
-- shot analyses. Deliberately simple — a duration, a date, an optional note —
-- not a workout tracker.
--
-- Idempotent: CREATE IF NOT EXISTS throughout, safe to re-run.

CREATE TABLE IF NOT EXISTS training_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'form_work' | 'basketball' — checked here as well as in the API so a raw
  -- SQL insert cannot invent a third kind the dashboard doesn't chart.
  activity_type VARCHAR(20) NOT NULL CHECK (activity_type IN ('form_work', 'basketball')),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 720),
  -- A calendar DATE, not a timestamp: "I practiced for 45 minutes on the 31st"
  -- is the grain players actually think in, and it sidesteps timezone drift.
  activity_date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Every dashboard read is "this user's recent entries" — one index covers it.
CREATE INDEX IF NOT EXISTS idx_training_activities_user_date
  ON training_activities (user_id, activity_date DESC);
