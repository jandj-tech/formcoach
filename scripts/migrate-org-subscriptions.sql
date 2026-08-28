-- Organization subscriptions, the pre-payment signup handoff, and the
-- grandfathering of everything that existed before paid plans.
--
-- IMPORTANT: scripts/migrate.ts replays every file in its FILES array on every
-- deploy, so nothing here may assume it runs once. The two backfills below are
-- each written to be a no-op on the second run — see the comments on them. A
-- naive `UPDATE teams SET entitlement_grandfathered = TRUE` would re-run on the
-- next deploy and silently grandfather every team created since launch, which
-- would quietly delete the paywall.

-- ---------------------------------------------------------------------------
-- A one-shot marker, so a data backfill can run exactly once no matter how
-- many times the file is replayed. Cheaper and more honest than picking a
-- launch date and hoping the deploy lands on the right side of it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS migration_marks (
  mark TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Organization subscription state, mirrored from Stripe by the webhook.
-- ---------------------------------------------------------------------------
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(32);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(16);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial unique index: many orgs may have no subscription id (comped, legacy),
-- but no two orgs may share one.
CREATE UNIQUE INDEX IF NOT EXISTS organizations_stripe_subscription_id_idx
  ON organizations (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS organizations_stripe_customer_id_idx
  ON organizations (stripe_customer_id);

-- Every organization that predates paid plans is entitled forever, with no card
-- on file and no expiry. Idempotent by construction: an org created after this
-- always has a status set (the webhook writes 'active', the admin comp path
-- writes 'comp'), so it can never be picked up by a later replay.
UPDATE organizations SET subscription_status = 'legacy' WHERE subscription_status IS NULL;

-- ---------------------------------------------------------------------------
-- Grandfathered entitlement for teams.
--
-- Named for what it means — permanent entitlement — not for the list of
-- features that happen to be gated today. A team with this flag is treated
-- exactly like a paying team by lib/team-features.ts, so any feature gated
-- later is automatically included and parity cannot drift.
-- ---------------------------------------------------------------------------
ALTER TABLE teams ADD COLUMN IF NOT EXISTS entitlement_grandfathered BOOLEAN NOT NULL DEFAULT FALSE;

-- Grandfather every team that exists the FIRST time this file runs, and never
-- again. The marker is what makes the replay safe: teams created after launch
-- default to FALSE and stay FALSE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM migration_marks WHERE mark = 'grandfather-teams-v1') THEN
    UPDATE teams SET entitlement_grandfathered = TRUE;
    INSERT INTO migration_marks (mark) VALUES ('grandfather-teams-v1');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Pre-payment signup handoff.
--
-- An organization must not exist until its first payment succeeds, but the
-- admin picks their password before checkout. This row holds the bcrypt hash
-- server-side; only the opaque token travels — to the pricing page in an
-- httpOnly cookie, and to Stripe in checkout metadata. Plaintext never leaves
-- the /api/org/signup/start handler.
--
-- offer_expires_at is the server's copy of the 5-minute launch-offer countdown.
-- The client only renders it; /api/org/subscribe re-reads this column and
-- ignores whatever the client claims. offer_grants bounds how many times the
-- countdown may be re-armed, so "resets when you come back" stays true for a
-- real visitor without the discount being infinitely renewable by a script.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pending_org_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(64) UNIQUE NOT NULL,
  org_name VARCHAR(200) NOT NULL,
  admin_email VARCHAR(255) NOT NULL,
  player_count INTEGER,
  password_hash VARCHAR(255) NOT NULL,
  plan VARCHAR(16),
  offer_expires_at TIMESTAMPTZ,
  offer_grants INTEGER NOT NULL DEFAULT 0,
  stripe_session_id TEXT,
  organization_id UUID REFERENCES organizations(id),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS pending_org_signups_email_idx ON pending_org_signups (admin_email);
CREATE INDEX IF NOT EXISTS pending_org_signups_expiry_idx ON pending_org_signups (expires_at)
  WHERE consumed_at IS NULL;
