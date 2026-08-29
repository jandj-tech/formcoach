-- Make refunds visible in the app.
--
-- Refunding in the Stripe dashboard used to leave no trace here at all: the
-- order still read as a clean sale, so the admin Orders page and any revenue
-- figure taken from it silently overstated what was actually kept.
--
-- Pure ADD COLUMN IF NOT EXISTS — scripts/migrate.ts replays every file on
-- every deploy.

-- Orders are keyed by checkout session, but a refund event arrives against a
-- CHARGE. The payment intent is the value both sides share, so store it at
-- record time and the webhook can find the order without a Stripe round-trip.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255);
CREATE INDEX IF NOT EXISTS orders_payment_intent_idx
  ON orders (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- Partial refunds are normal — a goodwill month back, a prorated correction —
-- so record the AMOUNT rather than a boolean. refunded_cents is the running
-- total Stripe reports, not a delta, so a second partial refund overwrites
-- rather than accumulating and double-counting.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_cents INTEGER;
