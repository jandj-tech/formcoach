-- One-time new-account starter offer: 5 analysis tokens for $10.
-- starter_offer_expires_at is stamped at signup (72h window); existing
-- accounts keep NULL and never see the offer. starter_offer_used_at is
-- stamped by the Stripe webhook when the pack is purchased.
ALTER TABLE users ADD COLUMN IF NOT EXISTS starter_offer_expires_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS starter_offer_used_at TIMESTAMP;
