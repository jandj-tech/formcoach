-- Team token pool.
--
-- token_pool   : tokens bought for a team, awaiting assignment to players.
-- initiated_at : DEAD COLUMN. It marked a team that had paid the one-time
--                initiation package, back when the team token rate was gated
--                behind a roster of 8+ joined players. That gate was deleted in
--                046c4a7 — every team and organization now gets the team rate
--                from its first day, and an org subscription carries the team
--                features outright. Nothing reads or writes this column; the
--                ALTER stays only so re-running this migration on an existing
--                database is a no-op.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS token_pool INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS initiated_at TIMESTAMPTZ;
