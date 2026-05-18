-- Organization-owned analysis token balance.
-- The org buys tokens into this balance, then distributes them: assigns them
-- to players, gives them to a coach (as coach credits), or spends them on the
-- org owner's own uploads.
-- Run: psql $DATABASE_URL -f scripts/migrate-org-token-balance.sql

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS token_balance INTEGER NOT NULL DEFAULT 0;
