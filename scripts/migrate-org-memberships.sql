-- Org-sponsored player memberships (2026-09-28).
--
-- An organization prepays a block of Player/Pro seats for a fixed term
-- (3/6/12 months, one Stripe Checkout in mode 'payment'). Each seat can be
-- assigned to one rostered player at a time. Coverage NEVER lives in the
-- users.plan slot: Apple (RevenueCat) and personal Stripe events write that
-- slot, and would overwrite or cancel an org pass. The resolver
-- (lib/player-entitlement.ts) reads both and picks the better plan.
--
-- Also: pending_token_grants, the server-side recipient list for the
-- /api/{org,team}/buy-player-tokens checkouts. User ids used to ride in Stripe
-- metadata, whose 500-char value limit broke checkout at ~14 players.
--
-- Idempotent throughout; safe to re-run.

CREATE TABLE IF NOT EXISTS org_membership_orders (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan                      VARCHAR(10) NOT NULL,          -- 'player' | 'pro'
  term                      VARCHAR(4) NOT NULL,           -- 'm3' | 'm6' | 'm12'
  seats                     INTEGER NOT NULL CHECK (seats > 0),
  tier                      INTEGER NOT NULL,              -- 10 | 25 | 50 at purchase time
  unit_cents                INTEGER NOT NULL CHECK (unit_cents >= 0),
  total_cents               INTEGER NOT NULL CHECK (total_cents >= 0),
  currency                  VARCHAR(3) NOT NULL DEFAULT 'usd',
  -- 'pending' (checkout open) | 'paid' | 'refunded' | 'expired' (checkout abandoned)
  status                    VARCHAR(16) NOT NULL DEFAULT 'pending',
  starts_at                 TIMESTAMPTZ NOT NULL,
  ends_at                   TIMESTAMPTZ NOT NULL,
  -- Players to assign when payment clears. Kept here, never in Stripe metadata.
  pending_user_ids          UUID[] NOT NULL DEFAULT '{}',
  stripe_session_id         TEXT UNIQUE,
  stripe_payment_intent_id  TEXT,
  refunded_cents            INTEGER NOT NULL DEFAULT 0,
  created_by                VARCHAR(255),
  paid_at                   TIMESTAMPTZ,
  refunded_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_org_membership_orders_org ON org_membership_orders (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_membership_orders_pi
  ON org_membership_orders (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS org_membership_seats (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id               UUID NOT NULL REFERENCES org_membership_orders(id) ON DELETE CASCADE,
  org_id                 UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan                   VARCHAR(10) NOT NULL,
  term                   VARCHAR(4) NOT NULL,
  starts_at              TIMESTAMPTZ NOT NULL,
  ends_at                TIMESTAMPTZ NOT NULL,
  -- 'pending_payment' | 'unassigned' | 'assigned' | 'expired' | 'refunded'
  status                 VARCHAR(16) NOT NULL DEFAULT 'pending_payment',
  user_id                UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at            TIMESTAMPTZ,
  -- Usage windows for the holder derive from this (lib/player-plans.ts).
  anchor_at              TIMESTAMPTZ,
  -- Set when assigning paused the holder's personal Stripe subscription.
  paused_stripe_sub_id   TEXT,
  -- Set once the pause decision for the current holder has been made (at
  -- assignment for a live seat, by the cron when a future-dated seat starts).
  pause_checked_at       TIMESTAMPTZ,
  reminded_30_at         TIMESTAMPTZ,
  reminded_7_at          TIMESTAMPTZ,
  player_reminded_7_at   TIMESTAMPTZ,
  ended_email_at         TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Columns added after the first local run (CREATE TABLE IF NOT EXISTS skips them).
ALTER TABLE org_membership_seats ADD COLUMN IF NOT EXISTS pause_checked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_org_membership_seats_org ON org_membership_seats (org_id, status);
CREATE INDEX IF NOT EXISTS idx_org_membership_seats_order ON org_membership_seats (order_id);
CREATE INDEX IF NOT EXISTS idx_org_membership_seats_ends ON org_membership_seats (ends_at) WHERE status IN ('assigned', 'unassigned');
-- One live seat per player, across every org.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_org_membership_seat_holder
  ON org_membership_seats (user_id) WHERE status = 'assigned';

-- Who held which seat and with which usage anchor. Re-assigning a player who
-- held a seat recently reuses their anchor, so bouncing a seat between two
-- players can't reset anyone's weekly/monthly window.
CREATE TABLE IF NOT EXISTS org_membership_seat_history (
  id           BIGSERIAL PRIMARY KEY,
  seat_id      UUID NOT NULL REFERENCES org_membership_seats(id) ON DELETE CASCADE,
  org_id       UUID NOT NULL,
  user_id      UUID NOT NULL,
  anchor_at    TIMESTAMPTZ NOT NULL,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at  TIMESTAMPTZ,
  reason       VARCHAR(32)
);
CREATE INDEX IF NOT EXISTS idx_org_membership_seat_history_user ON org_membership_seat_history (user_id, assigned_at DESC);

-- Usage stamped by an org seat counts through the same partial-index shape
-- as 'subscription' (lib/player-subscription.ts counts both).
CREATE INDEX IF NOT EXISTS idx_submissions_org_membership_usage
  ON submissions (user_id, created_at)
  WHERE entitlement_source = 'org_membership';

-- Server-side recipient lists for player token grants (buy-player-tokens).
CREATE TABLE IF NOT EXISTS pending_token_grants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_kind          VARCHAR(8) NOT NULL,       -- 'org' | 'team'
  buyer_ref           UUID NOT NULL,             -- organizations.id | teams.id
  recipient_user_ids  UUID[] NOT NULL,
  tokens_each         INTEGER NOT NULL CHECK (tokens_each > 0),
  stripe_session_id   TEXT UNIQUE,
  fulfilled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
