-- One-time claim tokens for guest ball purchases. The checkout route inserts
-- a row before creating the Stripe session; signup/login redeem it into
-- users.analysis_tokens after the buyer creates or enters their account.
-- This table was written/read by the app but never had a migration — a fresh
-- database would 500 on guest checkout without it.
CREATE TABLE IF NOT EXISTS pending_credit_claims (
  claim_token VARCHAR(36) PRIMARY KEY,
  tokens_to_grant INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redeemed_at TIMESTAMPTZ
);
