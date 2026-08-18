-- Let `orders` hold every purchase, not just balls.
--
-- The table was written for the shop: `variant` and `size` are NOT NULL with
-- ball-only CHECK constraints, so an analysis-token sale had nowhere to go and
-- was simply never recorded. The admin Orders page therefore showed physical
-- shipments only, while real token revenue existed solely inside Stripe.
--
-- Dropping NOT NULL is enough. A CHECK is satisfied by NULL (the comparison is
-- unknown, not false), so `variant IN ('left','right')` keeps constraining ball
-- rows while letting digital rows leave it empty. No data to migrate — the
-- table was empty when this ran.
ALTER TABLE orders ALTER COLUMN variant DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN size DROP NOT NULL;

-- What was bought, in the buyer's words rather than a metadata key. Written at
-- record time so the admin list stays readable even if product names change.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS description VARCHAR(255);

-- Which account the purchase belongs to, when it is not simply the emailing
-- customer: an org buying tokens, a coach topping up their own credits.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_kind VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_ref VARCHAR(255);

-- The admin page reads newest-first across everything now, not just balls.
CREATE INDEX IF NOT EXISTS orders_created_at_desc ON orders (created_at DESC);
