-- A fixed LearnHoops fee per sale on an offer (e.g. $100 on every Shooting
-- Class sign-up), taking precedence over the org's percent split when set.
-- Snapshotted onto each order at purchase like the percent is; NULL = use the
-- percent (the org default or the offer's percent override).
ALTER TABLE org_offers ADD COLUMN IF NOT EXISTS platform_share_cents INTEGER
  CHECK (platform_share_cents IS NULL OR platform_share_cents >= 0);
