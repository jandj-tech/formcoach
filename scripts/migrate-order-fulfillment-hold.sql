-- Out-of-stock safety net for ball orders.
--
-- The shop and checkout now BLOCK out-of-stock sizes up front (lib/ball-inventory.ts
-- + app/api/checkout/route.ts), so this is the belt to that suspenders: if a
-- size we can't ship ever completes anyway (an un-updated app build, a stock
-- change mid-checkout), the webhook flags the order here instead of dropping it
-- into the ship queue, and emails the buyer a link to choose a refund or a swap.
--
-- Pure ADD COLUMN IF NOT EXISTS — scripts/migrate.ts replays every file on
-- every deploy.

-- TRUE while the order is parked out of the ship queue awaiting the buyer's
-- choice. A swap clears it back to FALSE so the row ships normally.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_hold BOOLEAN NOT NULL DEFAULT FALSE;

-- Why it's held. Today only 'out_of_stock_size'; a VARCHAR keeps room for more.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_reason VARCHAR(50);

-- Unauthenticated resolution link, same trust model as reset/invite tokens: a
-- random 32-byte hex, single-use, time-boxed. Shared across every row of one
-- checkout session so the resolve page handles the whole order at once.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_token VARCHAR(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_token_expires TIMESTAMPTZ;

-- Stamped once the buyer picks. hold_resolution is 'refunded' or 'swapped'.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_resolved_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_resolution VARCHAR(20);

-- The admin queue filters on held+unresolved; the resolve routes look up by token.
CREATE INDEX IF NOT EXISTS orders_fulfillment_hold_idx
  ON orders (fulfillment_hold) WHERE fulfillment_hold = TRUE;
CREATE INDEX IF NOT EXISTS orders_hold_token_idx
  ON orders (hold_token) WHERE hold_token IS NOT NULL;
