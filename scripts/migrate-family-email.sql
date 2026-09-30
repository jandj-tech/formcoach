-- Family email: several PLAYER accounts may share one address (siblings under
-- a parent's inbox); the password decides which account a sign-in opens.
-- Idempotent — safe to run on every deploy.
--
-- Code that reads users by email goes through lib/player-accounts.ts (every
-- row for lower(email), deterministic order) and credits address-keyed money
-- (guest purchases, ball claims, comps) to EXACTLY ONE account. That code
-- works with or without the old unique constraint, and nothing in the app or
-- scripts uses ON CONFLICT (email) on users any more (that would error once
-- the constraint is gone). Organization / team / coach emails are untouched.

-- Opt-in shared login between accounts on one address (P5 builds it).
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_group_id uuid;

-- Which account a complimentary membership granted to an address went to.
ALTER TABLE email_list ADD COLUMN IF NOT EXISTS comp_user_id uuid;

-- Lookups are by lower(email) now; this replaces the unique index the
-- constraint below provided.
CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

-- The unique-constraint drop lives in migrate-family-email-drop-unique.sql,
-- which scripts/migrate.ts runs ONLY in production builds: preview builds
-- share the production database, and dropping the constraint while the live
-- code still uses ON CONFLICT (email) on users breaks new OAuth signups.
