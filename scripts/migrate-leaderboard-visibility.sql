-- Coaches can hide the team leaderboard from players (coach/org views keep it).
-- 'team'   = every player sees the ranked board (today's behaviour, default)
-- 'hidden' = players see only their own row
-- Idempotent: safe to run repeatedly.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS leaderboard_visibility VARCHAR(20) NOT NULL DEFAULT 'team';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'teams_leaderboard_visibility_check'
      AND conrelid = 'teams'::regclass
  ) THEN
    ALTER TABLE teams ADD CONSTRAINT teams_leaderboard_visibility_check
      CHECK (leaderboard_visibility IN ('team', 'hidden'));
  END IF;
END $$;
