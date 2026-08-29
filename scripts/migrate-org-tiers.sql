-- Basic / Plus tiers for the organization subscription.
--
-- scripts/migrate.ts replays every file in FILES on every deploy, so this one
-- stays a pure ADD COLUMN IF NOT EXISTS. There is deliberately NO backfill —
-- see below.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(16);

-- The signup handoff has to carry the chosen tier across Stripe, alongside the
-- billing interval it already stored in `plan`. Two columns rather than one
-- packed string: the webhook writes each straight through to the organization,
-- and neither has to be parsed back apart.
ALTER TABLE pending_org_signups ADD COLUMN IF NOT EXISTS tier VARCHAR(16);

-- No UPDATE here on purpose.
--
-- Organizations that predate paid plans carry subscription_status = 'legacy',
-- and comped ones carry 'comp'. Both are resolved to Plus by lib/team-features.ts
-- from their STATUS, never from a tier written into this column — so the
-- grandfathering rule lives in exactly one place, and renaming or re-pricing a
-- tier later can never silently demote an org that was promised everything for
-- free. Their subscription_tier stays NULL, which reads correctly as "no tier
-- was ever purchased".
--
-- Paying organizations get their tier written by the Stripe webhook when the
-- subscription is created, reactivated, or changed.
