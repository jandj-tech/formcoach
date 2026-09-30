-- Direct player add + account-setup status for the org/team dashboards.
--
-- When a coach or org adds a player WITH an email, we create a real (but
-- password-less) users row + team_membership immediately, so the player shows
-- up in the normal roster, the org can act on their behalf right away, and a
-- later self-signup with the same email completes THIS record instead of
-- duplicating it (see app/api/auth/signup + lib/oauth-account).
--
-- Idempotent and additive — safe to run against the live DB.

-- Optional contact details captured when a player is added by a coach/org.
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_name VARCHAR(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(40);

-- roster_pending = true marks a users row that a coach/org created as a stub
-- (no password yet). It is the player-side equivalent of a coach's "Invite
-- pending" state. Cleared the moment the player sets a password (self-signup,
-- setup link, or password reset) or links an OAuth identity. A plain
-- password_hash IS NULL test can't be used because OAuth-only players also
-- have a null hash yet are fully set up.
ALTER TABLE users ADD COLUMN IF NOT EXISTS roster_pending BOOLEAN DEFAULT false;

-- Fast lookup of a team's incomplete players for the dashboard status column.
CREATE INDEX IF NOT EXISTS idx_users_roster_pending
  ON users (roster_pending) WHERE roster_pending = true;
