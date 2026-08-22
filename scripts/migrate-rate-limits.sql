-- Rate-limit counters, shared across serverless instances.
--
-- lib/rate-limit.ts creates this on first use as well (same self-healing
-- approach as support_requests), so applying this file is optional — it exists
-- so the schema is documented alongside every other migration.

CREATE TABLE IF NOT EXISTS rate_limit_hits (
  id BIGSERIAL PRIMARY KEY,
  bucket VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rate_limit_hits_bucket_created_idx
  ON rate_limit_hits (bucket, created_at);
