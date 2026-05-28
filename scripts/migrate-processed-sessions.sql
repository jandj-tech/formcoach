-- Idempotency table for Stripe checkout sessions whose free-analysis credits
-- have been granted. The grant flow inserts a row here as its "claim" — both
-- the webhook and the success-page safety net try to insert, and only the
-- first one (whichever runs first) actually grants the credits.
CREATE TABLE IF NOT EXISTS processed_stripe_sessions (
  session_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tokens_granted INTEGER NOT NULL DEFAULT 0,
  recipient TEXT
);
