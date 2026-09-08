-- One row per cookie-consent decision.
--
-- The point is the RATE, not the person: what share of the visitors an ad paid
-- for accept marketing cookies. Without it, the attribution cost of the banner
-- can only be argued about, and every conversion-rate denominator on paid
-- traffic is a guess.
--
-- Deliberately holds NO identifier — no user id, no IP, no cookie value — so it
-- records how the banner performs without becoming a log of who visited.
CREATE TABLE IF NOT EXISTS consent_events (
  id BIGSERIAL PRIMARY KEY,
  -- 'accept' or 'reject': whether marketing cookies ended up on.
  choice TEXT NOT NULL,
  -- The page the decision was made on, so landing routes can be read apart
  -- from the rest of the site.
  path TEXT,
  -- Campaign context when the visitor arrived from an ad.
  utm_source TEXT,
  utm_campaign TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_events_created ON consent_events (created_at DESC);
