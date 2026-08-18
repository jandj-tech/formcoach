-- In-app purchase events recorded by the RevenueCat webhook. One row per
-- RevenueCat event id; a purchase credits tokens only when its insert wins,
-- so re-delivered webhooks and replayed requests can never grant twice.
-- Rows with user_id NULL are purchases we couldn't match to an account,
-- kept for support reconciliation.
CREATE TABLE IF NOT EXISTS iap_events (
  event_id VARCHAR(255) PRIMARY KEY,
  transaction_id VARCHAR(255),
  user_id UUID,
  product_id VARCHAR(255),
  tokens_granted INTEGER NOT NULL DEFAULT 0,
  acknowledged_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS iap_events_user_created_idx ON iap_events (user_id, created_at);
