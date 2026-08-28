-- Performance indexes for hot read paths.
--
-- Postgres does not auto-index foreign-key columns, so several per-request
-- queries were doing sequential scans on tables that grow forever:
--   * lib/filming-tips.ts shouldShowInboxNotice() runs on EVERY results-page
--     view: a join on analyses.submission_id + a filter on submissions.user_id,
--     plus an EXISTS on email_logs by (lower(email), email_type).
--   * app/api/admin/submissions ORDER BY submissions.created_at DESC.
--   * app/api/cron/promo NOT EXISTS on email_logs (email, email_type).
-- Under concurrent load these seq scans saturate the 10-connection pool. All
-- CREATE INDEX IF NOT EXISTS, so this migration is safe to re-run.

-- analyses.submission_id and submissions.created_at exist in the base schema.
CREATE INDEX IF NOT EXISTS idx_analyses_submission_id ON analyses (submission_id);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions (created_at DESC);

-- email_logs lookups: promo uses (email, email_type); filming-tips wraps the
-- column in lower(email), so it needs a matching functional index to be usable.
CREATE INDEX IF NOT EXISTS idx_email_logs_email_type ON email_logs (email, email_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_lower_email_type ON email_logs (lower(email), email_type);

-- submissions.user_id / team_id are added by later migrations; guard the index
-- creation so this file never fails if a column isn't present in some database.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'user_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions (user_id);
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'team_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_submissions_team_id ON submissions (team_id);
  END IF;
END $$;

-- Persistent ledger for one-time free-token grants (lib/team-tokens.ts). Keyed
-- by (user_id, team_id) so it survives team_memberships deletion — a member can
-- no longer leave and rejoin to farm a fresh free token each cycle. Created
-- here as well as self-healing in code so it exists on a plain migrate run.
CREATE TABLE IF NOT EXISTS team_free_token_grants (
  user_id UUID NOT NULL,
  team_id UUID NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, team_id)
);
