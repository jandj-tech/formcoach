-- Password reset for coach and organization accounts.
-- Previously only the `users` table had reset-token columns, so the
-- forgot-password flow silently did nothing for coaches (teams / team_coaches)
-- and organizations. These columns let those accounts reset their password too.
-- Run: psql $DATABASE_URL -f scripts/migrate-coach-password-reset.sql

ALTER TABLE teams ADD COLUMN IF NOT EXISTS reset_token VARCHAR(64);
ALTER TABLE teams ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;

ALTER TABLE team_coaches ADD COLUMN IF NOT EXISTS reset_token VARCHAR(64);
ALTER TABLE team_coaches ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS reset_token VARCHAR(64);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;
