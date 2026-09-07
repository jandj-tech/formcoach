-- Org results delivery, visibility tiers, paywall, and per-org offers.
--
-- An organization sends players their evaluation scores by email; a
-- result_releases row snapshots how much of the report that player sees for
-- free. Orgs sell upgrades (breakdown unlock, ball bundle, Shooting Class)
-- through org_offers at prices they control. Selling is quote-gated:
-- organizations.platform_share_percent stays NULL until the site admin sets
-- that org's revenue split, and nothing can be activated or purchased before
-- then. Shares are snapshotted onto each order at purchase time so a later
-- reprice or renegotiated split never rewrites history.

CREATE TABLE IF NOT EXISTS org_result_settings (
  org_id      UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  -- 'full' by default: a brand-new org sends complete reports until it
  -- deliberately chooses a lower free tier, so a first send is never an
  -- accidental paywall with nothing to buy.
  free_tier   VARCHAR(20) NOT NULL DEFAULT 'full'
              CHECK (free_tier  IN ('score','categories','breakdown','full')),
  unlock_tier VARCHAR(20) NOT NULL DEFAULT 'full'
              CHECK (unlock_tier IN ('score','categories','breakdown','full')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_offers (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind                   VARCHAR(20) NOT NULL CHECK (kind IN ('breakdown','ball','course','bundle')),
  title                  VARCHAR(120) NOT NULL,
  description            VARCHAR(500),
  includes_breakdown     BOOLEAN NOT NULL DEFAULT FALSE,
  includes_ball          BOOLEAN NOT NULL DEFAULT FALSE,
  includes_course        BOOLEAN NOT NULL DEFAULT FALSE,
  regular_price_cents    INTEGER NOT NULL,
  club_price_cents       INTEGER,
  discount_price_cents   INTEGER,
  shipping_cents         INTEGER NOT NULL DEFAULT 0,
  join_team_id           UUID REFERENCES teams(id) ON DELETE SET NULL,
  -- 'submission': the purchase unlocks the one report it was bought from.
  -- 'player': it unlocks every report this org releases to that player, past
  -- and future (a class or ball buyer is never re-paywalled next week).
  unlock_scope           VARCHAR(20) NOT NULL DEFAULT 'submission'
                         CHECK (unlock_scope IN ('submission','player')),
  active                 BOOLEAN NOT NULL DEFAULT FALSE,
  platform_share_percent NUMERIC(5,2)
                         CHECK (platform_share_percent IS NULL OR platform_share_percent BETWEEN 0 AND 100),
  sort_order             INTEGER NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS org_offers_org ON org_offers(org_id);

-- One release per submission. free_tier is a snapshot of the org's setting at
-- send time; a resend refreshes it. unlocked flips on the first purchase of an
-- offer that includes the breakdown and never flips back.
CREATE TABLE IF NOT EXISTS result_releases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id           UUID REFERENCES teams(id) ON DELETE SET NULL,
  submission_id     UUID NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
  recipient_user_id UUID,
  recipient_email   VARCHAR(255),
  free_tier         VARCHAR(20) NOT NULL
                    CHECK (free_tier IN ('score','categories','breakdown','full')),
  unlocked          BOOLEAN NOT NULL DEFAULT FALSE,
  unlocked_at       TIMESTAMPTZ,
  unlock_order_id   UUID,
  -- The tier the buyer was promised, stamped at purchase. Read in preference
  -- to the org's live unlock setting so a later settings change can never
  -- strip content someone already paid for.
  unlocked_tier     VARCHAR(20)
                    CHECK (unlocked_tier IS NULL OR unlocked_tier IN ('score','categories','breakdown','full')),
  sent_at           TIMESTAMPTZ,
  resent_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS result_releases_org ON result_releases(org_id);

-- Player-scoped unlocks (offers with unlock_scope = 'player'). Matched to a
-- release by recipient user id or, failing that, recipient email, so a class
-- buyer stays unlocked on every future weekly result from this org.
CREATE TABLE IF NOT EXISTS org_player_unlocks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       UUID,
  email         VARCHAR(255),
  unlocked_tier VARCHAR(20) NOT NULL
                CHECK (unlocked_tier IN ('score','categories','breakdown','full')),
  order_id      UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS org_player_unlocks_org_user ON org_player_unlocks(org_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS org_player_unlocks_org_email ON org_player_unlocks(org_id, LOWER(email)) WHERE email IS NOT NULL;

-- Manual payout ledger: what LearnHoops has actually paid an org of its
-- share, per currency (sales settle in the buyer's currency, so an org can be
-- owed CAD and USD at once). Negative amounts are clawback adjustments after
-- a refund that followed a payout.
CREATE TABLE IF NOT EXISTS org_payouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  currency     VARCHAR(10) NOT NULL DEFAULT 'usd',
  method       VARCHAR(50),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS org_payouts_org ON org_payouts(org_id);

-- Revenue attribution on the existing purchase ledger. The share columns are
-- point-of-sale snapshots of the PRODUCT portion (shipping is platform
-- pass-through and never split). Owed, per currency = SUM of each order's
-- org share scaled by (amount_total - refunded_cents) / amount_total, minus
-- SUM(org_payouts.amount_cents). stripe_payment_intent_id is written on the
-- base row so the existing charge.refunded handler can find it.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS offer_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS org_share_cents INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_share_cents INTEGER;
CREATE INDEX IF NOT EXISTS orders_org ON orders(org_id) WHERE org_id IS NOT NULL;

-- Quote-gated selling: NULL = this org cannot sell yet. The admin sets the
-- percent (the "quote") from the admin dashboard, which enables activation.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS platform_share_percent NUMERIC(5,2);
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_platform_share_percent_range'
  ) THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_platform_share_percent_range
      CHECK (platform_share_percent IS NULL OR platform_share_percent BETWEEN 0 AND 100);
  END IF;
END $$;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS offers_requested_at TIMESTAMPTZ;
