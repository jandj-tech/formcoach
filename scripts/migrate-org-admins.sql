-- Additional organization admin logins (lib/org-admins.ts).
--
-- An organization used to have exactly one login: organizations.admin_email
-- + password_hash. An org can now link further ADMIN accounts, each with its
-- own email and password, that act as the organization everywhere the owner
-- can (every team, tokens, results, settings). Coaches keep their one-team
-- access; this is the "full-access organization account" choice beside
-- "coach for a team" when adding someone.
--
-- One row per linked email. An email can be a linked admin of ONE org
-- (unique on LOWER(email)); the owner's own address never gets a row.
-- password_hash is NULL until the invite is accepted (invite_token set).
-- email_proven_* mirror the coach rows (scripts/migrate-coach-email-proof.sql):
-- the invite link only ever goes to the inbox, so accepting it is proof.
--
-- Additive and idempotent.
CREATE TABLE IF NOT EXISTS org_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  password_hash VARCHAR(255),
  invite_token VARCHAR(64),
  invite_sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  reset_token VARCHAR(64),
  reset_token_expires TIMESTAMPTZ,
  email_proven_at TIMESTAMPTZ,
  email_proven_hash VARCHAR(255),
  invited_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS org_admins_email_key ON org_admins (LOWER(email));
CREATE INDEX IF NOT EXISTS org_admins_org_idx ON org_admins (org_id);
CREATE INDEX IF NOT EXISTS org_admins_invite_token_idx ON org_admins (invite_token);
CREATE INDEX IF NOT EXISTS org_admins_reset_token_idx ON org_admins (reset_token);
