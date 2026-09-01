-- Player subscriptions (LearnHoops Player / Pro) and per-analysis entitlement
-- accounting.
--
-- The legacy columns users.subscription_type / subscription_expires_at are
-- LEFT ALONE: whatever they hold today keeps meaning "grandfathered
-- unlimited" (see app/api/analyze). The new plan lives in its own columns so
-- the two systems can never be confused for one another.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS throughout, safe to re-run.

ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_interval VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_status VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_period_end TIMESTAMPTZ;
-- The subscription's billing_cycle_anchor: every weekly and monthly usage
-- window is derived from this one timestamp (lib/player-plans.ts), so usage
-- resets line up with billing and never depend on a viewer's timezone.
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_anchor TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_cancel_at_period_end BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Which balance funded a submission: 'subscription' | 'token' | 'legacy' |
-- 'coach_credit' | 'team_credit' | 'org_balance'. Subscription usage is
-- DERIVED by counting stamped submissions inside the current windows rather
-- than kept in a counter that can drift; a purchased-token analysis is never
-- stamped 'subscription', so it can never eat into the included allowance.
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS entitlement_source VARCHAR(20);

-- submissions.user_id is written by /api/analyze and exists in production,
-- but no migration ever created it (migrate-perf-indexes.sql already guards
-- for its absence). Created here so fresh databases match production before
-- the usage index below relies on it.
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS user_id UUID;

-- The usage count runs inside every subscription analysis reservation, so it
-- gets a purpose-built partial index: only stamped subscription rows, ordered
-- the way the window predicate reads them.
CREATE INDEX IF NOT EXISTS idx_submissions_subscription_usage
  ON submissions (user_id, created_at)
  WHERE entitlement_source = 'subscription';
