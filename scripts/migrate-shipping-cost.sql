-- Shipping charged at checkout (live carrier rates via Shippo). Recorded on
-- the first order row of a session only, mirroring amount_total.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost_cents INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_carrier VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_service VARCHAR(100);
