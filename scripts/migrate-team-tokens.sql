-- Team token pool + the $2.50-pricing initiation gate.
-- A team only gets the $2.50 coach/org token price after it is "initiated":
-- it must have at least 8 joined players and buy a one-time initiation
-- package of at least 10 tokens ($30 for the first 10, $2.50 each beyond).
--
-- token_pool   : tokens bought via the initiation package, awaiting assignment to players.
-- initiated_at : set when a team buys its initiation package; NULL = not yet initiated.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS token_pool INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS initiated_at TIMESTAMPTZ;

-- Policy: every team — old and new — must pay the $30 initiation package.
-- There is intentionally no grandfather clause.
